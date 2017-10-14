# DISCLAIMER

This is still very much _work-in-progress_. It is both under-tested and largely undocumented. Neither are desirable attributes in a secure system.

I don't yet use this for secrets I care about, and you shouldn't either. 

# Secret-Server

Even a small software development group has dozens of digital secrets. Usually they're things like:

* API keys for third-party services
* Database connection strings
* Certificates for access to remote servers

Without some kind of system, these keys can be difficult to distribute and track.

Secret Server makes it much more straightforward to manage your secrets. It stores all your keys in an encrypted repository, and lets you choose who can access each key.

Each user gets their own view with just the secrets they have access to. It works just like a remote disk, so no special tools are needed to access them. Unlike a regular filesystem, the secrets are only stored in memory. Secrets are decrypted for the each user only when needed.

Secret Server runs as a standalone service, and it has special features that make it work especially well on cloud services, AWS in particular.

## Goals and limitations

In any security system, there are inherent trade-offs between security and convenience. 

Secret Server attempts to make everyday development systems more secure by making it convenient to do the right thing. Lots of teams distribute secrets by hand and hope for the best. They know this is bad, but there isn't an obvious alternative.

By the same token, complex systems are inherently harder to secure. The more moving parts you have to deal with, the more likely it is that the system will be vulnerable because of a configuration mistake.

Secret Server attempts to address this by being as simple as possible. It does one thing—distribute secrets—using well-established techniques in a straightforward way.

## Getting started

### Understanding certificates

Secret Server uses X-509 certificates to authenticate clients and servers. This section assumes that you don't have this set up yet. If you already have a certificate authority that can issue both client and server certificates, you can skip this section.

If you run a web server, you may have gotten a certificate for it. In this case you probably paid a third party (like Symantec or DigiCert, or whoever) to sign your certificate. With their signature, you can serve pages over https, and the user's browser will display a reassuring green padlock icon to show everyone that your site is legitimate.

We will take a different approach for Secret Server.

In a typical web browsing scenario, a server presents a certificate, but the clients don't have to do anything special. They just type in the URL, and everything just works.

In our system, both the client and server will present certificates, and both parties will check that the certificates are compatible. This provides a strong two-way agreement. The process will only work if both parties have appropriate certificates, which provides a much stronger guarantee in the integrity of the system.

While this provides excellent security, it means we have a bit of work to do up-front.

### Creating your Certificate Authority

Instead of using a third party, we will be signing the certificates ourselves. We do this by creating what is called a Certificate Authority, which is basically just a private key and a few rules.

The standard way to do this is with OpenSSL. The ugly truth is that setting up a certificate authority, then generating and signing certificates with OpenSSL is an arcane process. There are lots of configuration options, many with little practical consequence to most users. If it makes you feel better, it seems that everyone feels this way, and various projects (like CloudFlare's CFSSL and Square's CertStrap) attempt to streamline the process.

Having said that, I still recommend that you use OpenSSL. First, it's very widely used. You can readily find examples for just about anything you'd want to do with it. Second, because of its critical role in internet security infrastructure, it gets intense scrutiny. And lastly, it's very heavily documented.

To make things easier, you can use cert-tools/cert-helper.sh 

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