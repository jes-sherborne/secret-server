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

## Installing Secret Server locally

To try out Secret Server on your machine, follow these steps

1. Install [node.js](https://nodejs.org/en/download/).
2. Get the server files and set up directories
    
    ```
    git clone https://github.com/jes-sherborne/secret-server.git
    cd secret-server
    mkdir ssl
    mkdir data
    npm install
    cd ..
    ```
    
3. Use cert-helper to set up your certificates
    
    ```
    git clone https://github.com/jes-sherborne/cert-helper.git
    mkdir ~/local-ca
    ./cert-helper/cert-helper.sh ~/local-ca
    ```

    * Choose _Create files for local testing_
    * For the organization, enter your name, your company name, or whatever suits you
    * Enter your name and email address at the prompts
    * Save the generated passwords with a password manager
    * Install your server root certificate ([instructions](https://github.com/jes-sherborne/cert-helper#trusting-your-root-certificate))
    * Install your client certificate ([instructions](https://github.com/jes-sherborne/cert-helper#working-with-client-certificates))
    
4. Create the configuration file
    
    ```
    ./secret-server/config/make-local-config
    ```

5. Add your server certificate files
    
    you will need to substitute your server name below:
    
    ```
    cp ~/local-ca/signing-ca-1/certs/ca-chain.cert.pem secret-server/ssl
    cp ~/local-ca/signing-ca-1/certs/your-server.cert.pem secret-server/ssl
    cp ~/local-ca/signing-ca-1/private/your-server.key.pem secret-server/ssl
    ```
    
6. Run the server

     ```
     cd secret-server
     node server.js config/config.json
     ```

7. Register as an administrator
   
   On the console, you will see a line that starts with, "The first administrator can auto-register". Follow this URL, and you will automatically be added as an administrator.
   
## Key concepts

Each secret is represented by a *file*. All files are read-only. Once a secret has been added, it cannot be changed.

Every entity that can connect to the system is a *user*.

Files and users belong to *groups*. A user can access all files from the groups she belongs to.

Users are identified by certificates.

Some users are *administrators*. Administrators can add files, add users, and edit the groups to which they belong.

# Security approach

Secret Server encrypts all sensitive data in storage. While it is a good practice to keep your storage secure and to limit access, Secret Server's security does not depend on it.

In addition, all data is authenticated to prevent tampering. This means that if an attacker gains access to the storage layer, the most they can do is prevent users from accessing secrets by deleting or mangling the data in some way. They can't alter the data to give any user access to different secrets.

All secrets are stored encrypted. They are decrypted just-in-time when they are needed, and they are discarded immediately afterward.

Secrets are stored using a technique called envelope encryption. Each secret is encrypted with a symmetric block cipher, and each secret uses a unique encryption key. These keys are provisioned, encrypted and decrypted by a separate key provider.

If you are running on AWS, you can use Amazon KMS to handle these keys for you, and Secret Server includes an adapter that will handle all the details automatically.

If you are running locally, you can configure Secret Server to handle this locally.

When asked to decrypt a key, Secret Server first opens the envelope and asks the encryption service to provide the secret-specific decryption key. It then uses this key to decrypt the actual secret.

In addition to the secret, the envelope also contains information about who is allowed to access the secrets. This data is authenticated to prevent tampering. If it has been modified, the underlying data cannot be decrypted.

This prevents an attacker with access to the database from modifying access privileges and thereby gaining access to unauthorized data. 