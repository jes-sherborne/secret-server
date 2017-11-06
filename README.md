# Secret-Server

Even a small software development group has dozens of digital secrets. Usually they're things like:

* API keys for third-party services
* Database connection strings
* Certificates for access to remote servers

Without some kind of system, these keys can be difficult to distribute and track. In practice, many teams distribute these secrets by hand or with some hastily-assembled scripts and hope for the best.

Secret Server provides a simple way to store, distribute, track, and secure your secrets. It is easy to install, easy to configure, and easy to maintain.

It can run anywhere, but it has special features that make it especially well suited to AWS.

## Installing Secret Server

Secret-server has extensive documentation to help you install it securely in a variety of configurations:

* [Installing on a local machine](docs/local-installation-guide.md)
* [Configuring AWS for secret-server](docs/configure-aws.md)
* [Installing as a service on Ubuntu](docs/ubuntu-installation-guide.md)

In addition, there is a [configuration guide](docs/config-file-reference.md).

## Additional features for public clouds

Secret-server was specifically designed to address the unique needs and capabilities of public clouds.

### Access to secrets

Let's say you have a system running on a public cloud like AWS. This system will need access to various secrets (like SSL keys, database connection strings, etc).

Ideally, you'd like to configure things so that secrets are only accessible to the cloud servers. Secret-server makes 
this especially convenient. It provides secrets on one port (1800 by default) and the administrative functions—but no access to secrets—on another port (1880 by default). This 
means you can expose the administrative interface publicly but restrict access to secrets to just the internal network for your production system.

### Encryption keys

On AWS, Secret-server can use [Amazon KMS](https://aws.amazon.com/documentation/kms/) as an encryption provider. This means that you can rely on the extensive key
management capabilities and security features of KMS while getting all of the convenience of secret-server.

### Storage

Secret server can be configured to use [Amazon S3](https://aws.amazon.com/s3/) as its storage layer. This means that you 
don't need to develop a backup strategy for the instance that runs Secret-server. All of your data is housed externally. 
You can easily migrate Secret-server to a new instance by copying over the configuration file.

## Retrieving secrets

A client that presents a valid certificate can download any secret to which they have been given access. There are a few
ways to accomplish this.

### Downloading a secret with curl

You will need access to your client certificate, client secret key, and possibly your client chain cert (depending on 
how you created your client certificates).

```bash
curl -v --cacert /path/to/ca-chain.cert.pem --key /path/to/user@domain.key.pem --cert /path/to/user@domain.cert.pem https://secret.example.com:1800/file-name
```

### Mounting secrets on the filesystem

Secret-server can act as a read-only WebDAV server, which means that you can access your secrets through the filesystem.
Each secret will appear as a file, and you can access them using any application.

WebDAV clients are available for every major operating system.

On Mac and Windows, you can use [Mountain Duck](https://mountainduck.io/). While MacOS has a built-in WebDAV client for 
Finder, it does not support client certificates, so it won't work for Secret-server.

On Linux, you can use [dav2fs](http://savannah.nongnu.org/projects/davfs2).

**Note on WebDAV security**—Some WebDAV servers have suffered from vulnerabilities. Secret-server is immune from these 
because it implements its own minimal read-only WebDAV server. It doesn't rely on external libraries or general-purpose
implementations. You can use the WebDAV interface for Secret-server with confidence.

### Retrieving secrets with node.js

You can use the built-in libraries in node.js to retrieve secrets. There are no external dependencies. Here is some example
code that you can adapt to your needs.

```js
const https = require("https");

function getSecret(callback) {
  var chunks = [];
  
  var requestOptions = {
    hostname: "secret.example.com",
    port: 1800,
    path: "/file-name",
    cert: fs.readFileSync("/path/to/user@domain.cert.pem"),
    key: fs.readFileSync("/path/to/user@domain.key.pem"),
    ca: fs.readFileSync("/path/to/ca-chain.cert.pem"),
  };
  
  https.get(requestOptions, function(res) {
    res.on("data", onData);
    res.on("error", onError);
    res.on("end", function() { onEnd(res) });
  });
    
  function onData(data) {
    chunks.push(data);
  }
  
  function onError(err) {
    callback(err);
  }
  
  function onEnd(res) {
    if (res.statusCode !== 200) {
      callback(new Error("Invalid response: " + res.statusCode + ": " + res.statusMessage));
    } else if (chunks.length === 0) {
      callback(null, null);
    } else if (typeof chunks[0] === "string") {
      callback(null, chunks.join(""));
    } else if (chunks[0] instanceof Buffer) {
      callback(null, Buffer.concat(chunks));
    } else {
      callback(new Error("unexpected response type"));
    }
  }

}
```

## Key concepts

Each secret is represented by a *file*. All files are read-only. Once a secret has been added, it cannot be changed.

Every entity that can connect to the system is a *user*.

Files and users belong to *groups*. A user can access all files from the groups she belongs to.

Users are identified by certificates.

Some users are *administrators*. Administrators can add files, add users, and edit the groups to which they belong.

## Security approach

Secret-server uses five core mechanisms to protect your secrets
1. All data is encrypted using proven implementations of standard encryption algorithms
2. All encryption uses authenticated encryption algorithms, meaning that if it has been altered, decryption fails. In
other words, an attacker cannot modify the storage layer to gain unauthorized access, even if they have a valid user certificate.
3. All access is controlled via X.509 certificates. The client and the server are both required to present compatible
certificates, which ensures that both the client and the server are validated.
4. Administrative functions are logically separate from access to secrets, and these two capabilities run on different 
ports. This means that secrets can be administered via a public interface, but access to the secrets themselves can be 
firewalled to a restricted set of endpoints. This is particularly useful if you are running secret-server in a public
cloud or remote data center.
5. Secrets are decrypted on-demand when an authorized user requests it. Secret-server only holds the decrypted secret long 
enough to transmit it to the client. It clears the memory afterward.

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
