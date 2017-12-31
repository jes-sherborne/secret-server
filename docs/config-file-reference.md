# Config file reference

Secret Server has a handful of options that change its behavior.

## Quick start for local testing

To quickly create a configuration file for local testing, just run `./make-local-config`. This will create a new secret key and set up Secret Server to store files locally.

## Configuration options

__allowAutoRegister:__ (_true/false_) This will automatically add a user to the system as long as they have a valid certificate and their email address is not already in use. This is safe because you are responsible for creating client certificates, and auto-registered users don't have access to any secrets until an admin gives them access.

__allowAutoRegisterFirstAdmin:__ (_true/false_) If this is _true_ AND there are no existing administrators of the system, Secret Server will generate a secret url which it writes to the console. If a user visits this URL with a valid certificate, they will be added as an administrator. After you have added your first administrator, you should set this value to false, because it is no longer needed.

__adminPort:__ (_port_number_) The administrative user interface runs on this port.

__davPort:__ (_port_number_) The actual secret files are available on this port. Secret Server presents a WebDAV server on this port, so it can be mounted with standard utilities.

__encryption:__ (_"aes-128-gcm"_ or _"aes-256-gcm"_) The algorithm used to encrypt secrets. "aes-128-gcm" is considered a very strong cipher at the time of writing. "aes-256-gcm" is supported for the paranoid.

__sslKey:__ (_string_) the path to the ssl secret key file

__sslCert:__ (_string_) the path to the ssl certificate file

__sslKey:__ (_string_) the path to the Certificate Authority's SSL certificate. This is usually a chain certificate

__storageService:__ (_object_) configuration options for the storage service. See below for details. 

__keyService:__ (_object_) configuration options for the key service. See below for details. 

## Storage services

Secret Server stores its encrypted data in the filesystem or an AWS S3 bucket

### File system

```
"storageService": {
  "provider": "file-system",
  "config": {
    "rootDirectory": "/path/to/data"
  }
}
```

### AWS S3 bucket

These are representative values, but you will have to change them to match your specific region, endpoint, and bucket.

```
  "storageService": {
    "provider": "aws-s3",
    "config": {
      "endpoint": "s3-us-west-1.amazonaws.com",
      "region": "us-west-1",
      "bucket": "your-bucket-name"
    }
  }
```

## Key services

Secret Server can generate secret keys locally or using AWS KMS. The local option is for testing or relatively low risk secrets.

AWS KMS provides much stronger security, provided it is configured correctly.

### Local key service

Uses Node's built-in OpenSSL implementation to create, encrypt, and decrypt secret keys. The master encryption key is provided in the config file.

`secretKey` is a 16-byte key encoded in hex (32 characters). If you use `make-local-config`, it will generate a cryptographically strong secretKey for you automatically. You can also generate a suitable key using OpenSSL: `openssl rand -hex 16`

```
  "keyService": {
    "provider": "local-symmetric",
    "config": {
      "secretKey": "1234567890abcdef1234567890abcdef"
    }
  }
```

### AWS KMS key service

Uses KMS to create, encrypt, and decrypt secret keys. These are representative values, but you will have to change them to match your specific region and key id

```
  "keyService": {
    "provider": "aws-kms",
    "config": {
      "region": "us-west-1",
      "defaultKey": "arn:aws:kms:us-west-1:5423542542:key/xxxxxxxxx-xxxxx-xxxx-xxxx-xxxxxxxxxx"
    }
  }
```