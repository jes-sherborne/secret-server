const console = require("console");
const fs = require("fs");
const https = require("https");
const morgan = require("morgan");
const helmet = require("helmet");
const compression = require("compression");
const crypto = require("crypto");
const davServer = require("./webdav/dav-server");
const SecretFilesystem = require("./filesystem/secret-filesystem").SecretFilesystem;
const admin = require("./admin/admin-server");


var appConfig = JSON.parse(fs.readFileSync(process.argv[2]));


var sslKey = fs.readFileSync(appConfig.sslKey);
var sslCert = fs.readFileSync(appConfig.sslCert);
var sslCA = fs.readFileSync(appConfig.sslCA);

var keyService = getService("keyService", {
  "local-symmetric": "./standard-services/local-symmetric-key-service",
  "aws-kms": "./aws-services/aws-kms-key-service"
});

var storageService = getService("storageService", {
  "file-system": "./standard-services/file-system-storage-service",
  "aws-s3": "./aws-services/aws-s3-storage-service"
});

var fileSystem = new SecretFilesystem({
  keyId: appConfig.defaultKeyId,
  keySpec: appConfig.encryption,
  keyService: keyService,
  sslCA: sslCA,
  storageService: storageService,
  onLoadComplete: onLoadComplete
});

function onLoadComplete(err) {
  if (err) {
    console.log("Could not load data");
    console.log(err);
    process.exit(1);
  }
  
  var middleware = createMiddleware();
  
  var appDav = https.createServer({
    key: sslKey,
    cert: sslCert,
    ca: sslCA,
    requestCert: true,
    rejectUnauthorized: true
  }, davServer.create({fileSystem: fileSystem}, middleware));
  
  appDav.listen(appConfig.davPort, function() {
    console.log("Dav server is listening on " + appDav.address().port);
  });
  
  var adminOptions = {
    fileSystem: fileSystem,
    allowAutoRegister: false,
    adminToken: null
  };
  
  if (appConfig.allowAutoRegister === true) {
    adminOptions.allowAutoRegister = true;
    if (appConfig.allowAutoRegisterFirstAdmin === true) {
      if (fileSystem.adminUserCount === 0) {
        adminOptions.adminToken = crypto.randomBytes(16).toString("hex")
      }
    }
  }
  
  var appAdmin = https.createServer({
    key: sslKey,
    cert: sslCert,
    ca: sslCA,
    requestCert: true,
    rejectUnauthorized: true
  }, admin.create(adminOptions, middleware));
  
  appAdmin.listen(appConfig.adminPort, function() {
    console.log("Admin is listening on " + appAdmin.address().port);
    if (adminOptions.allowAutoRegister) {
      console.log("Users can auto-register at /register");
      if (adminOptions.adminToken) {
        console.log("The first administrator can auto-register at /register?token=" + adminOptions.adminToken);
      }
      if (appConfig.allowAutoRegisterFirstAdmin && fileSystem.adminUserCount > 0) {
        console.log("We recommend setting 'allowAutoRegisterFirstAdmin = false' in your configuration file now that your system has at least one administrator.");
      }
    } else {
      console.log("Auto-register is off");
    }
  });

}

function getService(configKey, knownProviders) {
  var requirePath;
  
  if (!appConfig[configKey]) {
    console.log("Config is missing " + configKey + " entry");
    process.exit(1);
  }
  
  if (appConfig[configKey].provider == null) {
    console.log(configKey + " entry is missing provider entry");
    process.exit(1);
  }
  
  if (knownProviders[appConfig[configKey].provider]) {
    requirePath = knownProviders[appConfig[configKey].provider];
  } else {
    console.log("Unrecognized " + configKey + " provider");
    process.exit(1);
  }
  
  try {
    return require(requirePath).create(appConfig[configKey].config);
  } catch (e) {
    console.log("Could not create " + configKey);
    console.log(e);
  }
}

function createMiddleware() {
  
  morgan.token("auth-user", function(req, res) {
    if (!req.user) {
      return "No authenticated user";
    }
    return req.user.id + " " + req.user.name + " [" + req.user.certFingerprint + "]"
  });
  
  return [
    helmet({
      contentSecurityPolicy: {
        directives: {defaultSrc: ["'self'"]}
      }
    }),
    morgan(":remote-addr :auth-user :method :url :status :res[content-length] bytes - :response-time ms"),
    function(req, res, next) {
      if (req.socket && req.socket.authorized) {
        req.user = fileSystem.getUserForCert(req.socket.getPeerCertificate());
      }
      next();
    },
    compression()
  ];
}
