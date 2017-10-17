# DISCLAIMER

This is still very much _work-in-progress_. It is both under-tested and largely undocumented. Neither are desirable attributes in a secure system.

I don't yet use this for secrets I care about, and you shouldn't either. 

# Secret-Server

Even a small software development group has dozens of digital secrets. Usually they're things like:

* API keys for third-party services
* Database connection strings
* Certificates for access to remote servers

Without some kind of system, these keys can be difficult to distribute and track.

Secret Server makes it straightforward to manage your secrets. It stores all your keys in an encrypted repository, and lets you choose who can access each key.

Each user gets their own view with just the secrets they have access to. It works just like a remote disk, so no special tools are needed to access them. Unlike a regular filesystem, the secrets are only stored in memory. Secrets are decrypted for the each user only when needed.

Secret Server runs as a standalone service, and it has special features that make it work especially well on cloud services, AWS in particular.

## Goals and limitations

In any security system, there are inherent trade-offs between security and convenience. 

Secret Server strives to make everyday development systems more secure by making good security practices more convenient. Lots of teams distribute secrets by hand and hope for the best. They know this is bad, but there hasn't an easy-to-use alternative.

By the same token, complex systems are inherently harder to secure. It can be easy to make a seemingly-innocuous configuration change that ruins the overall security of the system, even if the underlying implemetation is done well.

Secret Server attempts to address this by being as simple as possible. It does one thing—distribute secrets—using well-established techniques in a straightforward way.

There are other systems that solve this problem, including Vault from Hashicorp and Key Whiz from Square. I think they're both great. But I also think that they can be very complex. If you need the additional capabilities that these systems provide, by all means use one.

But if you've looked at these and thought, "There has to be a simpler way!", then Secret Server may be for you.

## Getting started

Secret Server uses X-509 certificates to authenticate clients and servers. This section assumes that you don't have this set up yet. If you already have a certificate authority that can issue both client and server certificates, you can skip ahead.

Otherwise, create a directory to hold your certificates and type:

```
./cert-herlper.sh /path/to/cert/directory
```

You can use cert-helper to create files for local testing or production use.

__Tips__

* Be sure to save the generated passwords in a secure place like a password manager. You will need them to create new certificates and to install your client certificate.
* You should save these files in a secure location. A good compromise between convenience and security is to create an encrypted volume using something like Veracrypt. You should only mount this volume when you need to create new certificates.

__Extra steps for production systems__

If you are using these certificates in a production system, you should take additional steps.

1. Make a copy of `root-ca/certs/root-ca.cert.pem`. You will be installing this certificate widely
2. Move the entire `root-ca` directory to its own encrypted storage. Ideally, you should keep this offline. You will only need to use it if you need to create another signing CA, so it will not inconvenience you to keep it offline.
3. Install `root-ca.cert.pem` as a trusted certificate using the tools in your operating system

__Install your personal client certificate__

To connect to Secret Server, you will need to install the client certificate on your system. On Mac and Windows, just double-click the pfx file and supply your password.

## Key concepts

Each secret is represented by a *file*. All files are read-only. Once a secret has been added, it cannot be changed.

Every entity that can connect to the system is a *user*.

Files and users belong to *groups*. A user can access all files from the groups she belongs to.

Users are identified by certificates.

Some users are *administrators*. Administrators can add files, add users, and edit the groups to which they belong.

# Security approach

Secret Server encrypts all sensitive data in storage. While it is a good practice to keep your storage secure and to limit access, Secret Server's security does not depend on it.

In addition, all data is authenticated to prevent tampering. This means that if an attacker gains access to the storage layer, the most they could do is prevent users from accessing secrets by deleting or mangling the data in some way. They can't alter the data to give any user access to different secrets.

All secrets are stored encrypted. They are decrypted just-in-time when they are needed, and they are discarded immediately afterward.

Secrets are stored using a technique called envelope encryption. Each secret is encrypted with a symmetric block cipher, and each secret uses a unique encryption key. These keys are provisioned, encrypted and decrypted by a separate key provider.

If you are running on AWS, you can use Amazon KMS to handle these keys for you, and SS includes an adapter that will handle all the details automatically.

If you are running locally, you can configure SS to handle this locally.

When asked to decrypt a key, SS first opens the envelope and determines who provided the secret key. It asks this service to decrypt the key. It then uses this key to decrypt the actual secret.

In addition to the secret, the envelope also contains information about who is allowed to access the secrets. This data is authenticated to prevent tampering. If it has been modified, the underlying data cannot be decrypted.

This prevents an attacker with access to the database from modifying access privileges and thereby gaining access to unauthorized data. 