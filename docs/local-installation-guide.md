# Installing secret-server on a local machine

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
