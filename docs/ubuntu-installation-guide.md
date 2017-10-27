# Installing Secret Server on Ubuntu 16

## Update Ubuntu

This isn't strictly required, but it's a good practice to make sure your operating system is up-to-date before installing components.

```bash
sudo apt-get update
sudo apt-get -y dist-upgrade
sudo reboot
```

## Set up system for secret-server

```bash
# install dependencies
sudo apt-get -y install unzip git build-essential

# install node.js
cd ~
wget http://nodejs.org/dist/v6.11.4/node-v6.11.4-linux-x64.tar.gz
cd /usr/local
sudo tar --strip-components 1 -xzf ~/node-v6.11.4-linux-x64.tar.gz
rm ~/node-v6.11.4-linux-x64.tar.gz

# download secret-server and dependencies
sudo useradd secret-server
sudo mkdir /var/secret-server
sudo chown -R ubuntu: /var/secret-server
cd /var/secret-server
git clone https://github.com/jes-sherborne/secret-server.git src
mkdir ssl
cd src
npm install
```

## Add your server certificate files

You need to get the certificate files for your server to work. Assuming that these files are on your local machine, you can do something like this:

If you running on a cloud service like AWS, you will need to connect to the instance via SSH. You can use `scp` to upload your key files like this:

```bash
# Run on your local machine, not the secret-server instance
# Replace all the placeholders with your own values

scp -i /path/to/your-instance-ssl-key.pem path/to/ca-chain.cert.pem ubuntu@your-server-address:/var/secret-server/ssl
scp -i /path/to/your-instance-ssl-key.pem path/to/your-server-name.cert.pem ubuntu@your-server-address:/var/secret-server/ssl
scp -i /path/to/your-instance-ssl-key.pem path/to/your-server-name.key.pem ubuntu@your-server-address:/var/secret-server/ssl
```

Back on the server, you should change the certificate permissions:

```bash
# Run on secret-server instance

sudo chown secret-server /var/secret-server/ssl/*.*
```

## Configure secret-server

Use your favorite text editor to create the configuration file. You can do something like `pico /var/secret-server/config.json`

Here's a typical config file for an AWS instance. For more details, see the [config file reference](config-file-reference.md)

```json
{
  "allowAutoRegister": true,
  "allowAutoRegisterFirstAdmin": true,
  "adminPort": 1880,
  "davPort": 1800,
  "encryption": "aes-128-gcm",
  "sslKey": "/var/secret-server/ssl/your-server.key.pem",
  "sslCert": "/var/secret-server/ssl/your-server.cert.pem",
  "sslCA": "/var/secret-server/ssl/ca-chain.cert.pem",
  "storageService": {
    "provider": "aws-s3",
    "config": {
      "endpoint": "https://s3-us-west-2.amazonaws.com",
      "region": "us-west-2",
      "bucket": "secret-server-bucket"
    }
  },
  "keyService": {
    "provider": "aws-kms",
    "config": {
      "region": "us-west-2",
      "defaultKeyId": "arn:aws:kms:us-west-2:000000000000:key/00000000-0000-0000-0000-000000000000"
    }
  }
}
```

## Run for the first time

Start the secret-server using:

```bash
cd /var/secret-server
node src/server.js config.json
```

If everything works correctly, you should see something like:

```text
Dav server is listening on port 1800
Admin is listening on port 1880
Users can auto-register at https://localhost:1880/register
The first administrator can auto-register at https://localhost:1880/register?token=824a7d6727ed2b8077cb8c7bebb2680a
```

From your local machine (where you have a client cert installed), use a web browser to go to `https://localhost:1880/register?token=824a7d6727ed2b8077cb8c7bebb2680a`,
replacing `localhost` with your server name. This auto-registers you as an admin for the system.

Secret-server only generates the administrative auto-register url when there are no administrators in the system. For security, it generates a new token each time it runs.

Now that you have registered as an administrative user, you can disable this feature. Edit your `config.json` file and change `allowAutoRegisterFirstAdmin` to `true`

## Start secret-server automatically and recover from errors

In recent versions of Ubuntu, systemd is the recommended way to start and manage processes. You do this by creating a service file.

Create the file using your favorite editor. For example `sudo pico /etc/systemd/system/secret-server.service`

Here is a sample file that you can use as-is to start secret-server and restart it automatically:

```text
[Unit]
Description=secret-server
Wants=network-online.target
After=network-online.target

[Service]
Type=simple
Environment=NODE_ENV=production
ExecStart=/usr/local/bin/node src/server.js config.json
User=secret-server
WorkingDirectory=/var/secret-server
Restart=always

[Install]
WantedBy=multi-user.target

```

If you edit this file later, you will need to take an additional step for your changes to take effect: 

```bash
sudo systemctl daemon-reload
```

If secret-server is still running from before, you must stop it now, because it will conflict with the new process.
To start your server via sysctl, enter 

```bash
sudo systemctl start secret-server
```

If it doesn't work, you can examine the error log using `journalctl -u secret-server.service`

If everything is working, configure the system to start secret-server automatically:

```bash
sudo systemctl enable secret-server
```

And that's it. Secret server is fully installed and configured!

## Getting the latest version of secret-server

It's easy to update to the latest version of secret-server.

```bash
# stop the service
sudo systemctl stop secret-server
# get the latest code
cd /var/secret-server/src
git fetch
git merge
# update any dependencies
npm update
# restart the service
sudo systemctl start secret-server
```
