# Secret-Server

Even a small software development group has dozens of digital secrets. These typically include things like:

* API keys for third-party services
* Database connection strings
* Certificates for access to remote servers

These secrets are difficult to distribute and track.

# Cryptographic approach

All secrets are stored encrypted. They are decrypted just-in-time when they are needed, and they are discarded immediately afterward.

Secrets are stored using a technique called envelope encryption. Each secret is encrypted with a symmetric block cipher, and each secret uses a unique encryption key. These keys are provisioned, encrypted and decrypted by a separate key provider.

If you are running on AWS, you can use Amazon KMS to handle these keys for you, and SS includes an adapter that will handle all the details automatically.

If you are running locally, you can configure SS to handle this locally.

When asked to decrypt a key, SS first opens the envelope and determines who provided the secret key. It asks this service to decrypt the key. It then uses this key to decrypt the actual secret.

In addition to the secret, the envelope also contains information about who is allowed to access the secrets. This data is authenticated to prevent tampering. If it has been modified, the underlying data cannot be decrypted.

This prevents an attacker with access to the database from modifying access privileges and thereby gaining access to unauthorized data. 