# DISCLAIMER

This is still work-in-progress. It is both under-tested and largely undocumented. Neither are desirable attributes in a secure system.

I don't yet use this for secrets I care about, and you shouldn't either. 

# Secret-Server

Even a small software development group has dozens of digital secrets. Usually they're things like:

* API keys for third-party services
* Database connection strings
* Certificates for access to remote servers

Without some kind of system, these keys can be difficult to distribute and track. In practice, many teams distribute these secrets by hand or with some hastily-assembled scripts and hope for the best.

Secret Server provides a simple way to store, distribute, track, and secure your secrets.

It is easy to install, easy to configure, and easy to maintain.

It can run anywhere, but it has special features that make it especially well suited to AWS.

## Installing Secret Server

Secret-server has extensive documentation to help you install it securely in a variety of configurations:

* [Installing on a local machine](docs/local-installation-guide.md)
* [Configuring AWS for secret-server](docs/configure-aws.md)
* [Installing as a service on Ubuntu](docs/ubuntu-installation-guide.md)

In addition, there is a [configuration guide](docs/config-file-reference.md).
   
## Key concepts

Each secret is represented by a *file*. All files are read-only. Once a secret has been added, it cannot be changed.

Every entity that can connect to the system is a *user*.

Files and users belong to *groups*. A user can access all files from the groups she belongs to.

Users are identified by certificates.

Some users are *administrators*. Administrators can add files, add users, and edit the groups to which they belong.

# Security approach

Secret-server uses five core mechanisms to protect your secrets
1. All data is encrypted using proven implementations of standard encryption algorithms
2. All data is encrypted using authenticated encryption, meaning that if it has been altered, decryption fails. In
other words, an attacker cannot modify the storage layer to gain unauthorized access, even if they have a valid user certificate
3. All access is controlled via X.509 certificates. The client and the server are both required to present compatible
certificates, which ensures that both the client and the server are validated.
4. Administrative functions are logically separate from access to secrets and these two capabilities run on different 
ports. This means that secrets can be administered via a public interface, but access to the secrets themselves can be 
firewalled to a restricted set of endpoints. This is particularly useful if you are running secret-server in a public
cloud or remote data center.
5. Secrets are decrypted on-demand when an authorized user requests it. Secret-server only holds the decrypted secret long 
enough to transmit it to the client. It clears the memory afterward.

Secret Server encrypts all sensitive data in storage. While it is a good practice to keep your storage secure and to 
limit access, Secret Server's security does not depend on it.

In addition, all data is authenticated to prevent tampering. This means that if an attacker gains access to the storage 
layer, the most they can do is prevent users from accessing secrets by deleting or mangling the data in some way. They 
can't alter the data to give any user access to different secrets.

### Encryption details

Secrets are stored using a technique called envelope encryption. Each secret is encrypted with a symmetric block cipher, 
(either AES-128-GCM or AES-256-GCM) and each secret uses a unique encryption key. These keys are provisioned, encrypted and 
decrypted by a separate key provider. If you are running on AWS, you can use Amazon KMS to handle these keys for you, 
and Secret Server includes an adapter that will handle all the details automatically. If you are running locally, you 
can configure Secret Server to handle this internally.

When asked to decrypt a key, Secret Server first opens the envelope and asks the encryption service to provide the 
secret-specific decryption key. It then uses this key to decrypt the actual secret. In addition to the secret, the 
envelope also contains information about who is allowed to access the secrets. This data is authenticated to prevent 
tampering. If it has been modified, the underlying data cannot be decrypted.
