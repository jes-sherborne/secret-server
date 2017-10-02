const express = require("express");
const multiparty = require("multiparty");
const fs = require("fs");
const console = require("console");
const path = require("path");
const helpers = require("../helpers");
const crypto = require("crypto");

function create(options, middleware) {
  const app = express();
  const fileSystem = options.fileSystem;
  const adminToken = options.adminToken;
  const allowAutoRegister = options.allowAutoRegister;
  const csrfHmacKey = crypto.randomBytes(32);
  
  middleware = (middleware || []).concat([function(req, res, next) {
    if (req.path === "/register" || req.path.startsWith("/static/")) {
      next();
      return;
    }
    if (!req.user || !(req.user.role === "admin")) {
      res.sendStatus(403);
      return;
    }
    next();
  }]);
  app.use(middleware);
  
  app.use("/static", express.static(path.join(__dirname, "static")));
  
  app.get("/", function(req, res) {
    res.send(pageHtml(req, "/static/admin-client.js", null));
  });
  
  app.get("/data", function(req, res) {
    var result = {files: [], users: [], groups: null};
  
    fileSystem.forEachFile(function(file) {
      result.files.push({
        id: file.id,
        createdAt: +(file.createdAt),
        contentLength: file.contentLength,
        contentType: file.contentType,
        groups: Array.from(file.groups)
      });
    });
  
    fileSystem.forEachUser(function(user) {
      result.users.push({
        id: user.id,
        name: user.name,
        role: user.role,
        validStart: +(user.validStart),
        validEnd: +(user.validEnd),
        certFingerprintExtract: user.certFingerprint.substr(0, 5) + " … " + user.certFingerprint.substr(-5),
        groups: Array.from(user.groups)
      });
    });
    
    result.groups = Array.from(fileSystem.getGroups()).sort();
    
    result.token = createCsrfToken(csrfHmacKey, req.user.id);
  
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.send(result);
  });
  
  app.post("/files", function(req, res) {
    var formParser = new multiparty.Form({
      maxFields: 1024,
      maxFilesSize: 64 * 1024,
      maxFieldsSize: 64 * 1024
    });
    
    formParser.parse(req, function (err, fields, files) {
      var name, groups, fileSource;
      
      if (err) {
        if (err.status === 413) {
          finish(new helpers.WebError(413, err.message));
        } else {
          finish(new helpers.WebError(400, "Invalid form values"));
        }
        return;
      }
      
      if (!validateCsrfToken(csrfHmacKey, req.user.id, fields.token ? fields.token[0] : null)) {
        finish(new helpers.WebError(400, "Please reload the page and try again"));
        return;
      }
      
      name = fields.name ? fields.name[0] : null;
      groups = parseGroupFields(fields);
      fileSource = files.file && files.file[0] && files.file[0].size > 0 ? files.file[0] : null;
      
      if (name == null || groups == null || fileSource == null || typeof name !== "string") {
        finish(new helpers.WebError(400, "Invalid form values"));
        return;
      }
  
      name = name.toLowerCase();
      fs.readFile(fileSource.path, function(err, fileData) {
        if (err) {
          finish(err);
          return;
        }
        fileSystem.addFile({id: name, fileData: fileData, groups: groups}, finish);
      });
  
      function finish(err) {
        finishFileResponse(res, files, err)
      }
    });
  });
  
  app.post("/users", function(req, res) {
    var formParser = new multiparty.Form({
      maxFields: 1024,
      maxFilesSize: 64 * 1024,
      maxFieldsSize: 64 * 1024
    });
    
    formParser.parse(req, function (err, fields, files) {
      var groups, fileSource, role;
      
      if (err) {
        if (err.status === 413) {
          finish(new helpers.WebError(413, err.message));
        } else {
          finish(new helpers.WebError(400, "Invalid form values"));
        }
      }
  
      if (!validateCsrfToken(csrfHmacKey, req.user.id, fields.token ? fields.token[0] : null)) {
        finish(new helpers.WebError(400, "Please reload the page and try again"));
        return;
      }
      
      groups = parseGroupFields(fields);
      role = fields.role ? fields.role[0] : null;
      fileSource = files.file && files.file[0] && files.file[0].size > 0 ? files.file[0] : null;
      
      if (groups == null || fileSource == null || role == null) {
        finish(new helpers.WebError(400, "Invalid form values"));
        return;
      }
      
      validateUserCert(fileSource, function(err, certificateInfo) {
        if (err) {
          finish(err);
          return;
        }
        fileSystem.addUser(
          {
            id: certificateInfo.emailAddress,
            name: certificateInfo.commonName,
            groups: groups,
            role: role,
            validStart: new Date(certificateInfo.validStart),
            validEnd: new Date(certificateInfo.validEnd),
            certFingerprint: certificateInfo.certFingerprint
          },
          finish
        );
      });
      
      function finish(err) {
        finishFileResponse(res, files, err)
      }
    });
  });
  
  app.post("/file-groups", function(req, res) {
    updateGroups(req, res, "updateFileGroups");
  });
  
  app.post("/user-groups", function(req, res) {
    updateGroups(req, res, "updateUserGroups");
  });
  
  function updateGroups(req, res, update) {
    var formParser = new multiparty.Form({
      maxFields: 1024,
      maxFilesSize: 0,
      maxFieldsSize: 64 * 1024
    });
  
    formParser.parse(req, function (err, fields) {
      var id, groups;
  
      if (err) {
        if (err.status === 413) {
          finish(new helpers.WebError(413, err.message));
        } else {
          finish(new helpers.WebError(400, "Invalid form values"));
        }
      }
  
      if (!validateCsrfToken(csrfHmacKey, req.user.id, fields.token ? fields.token[0] : null)) {
        finish(new helpers.WebError(400, "Please reload the page and try again"));
        return;
      }
    
      id = fields.id ? fields.id[0] : null;
      groups = parseGroupFields(fields);
    
      fileSystem[update](id, groups, finish);
    
      function finish(err) {
        finishFileResponse(res, null, err)
      }
    });
  }
  
  app.post("/user-data", function(req, res) {
    var formParser = new multiparty.Form({
      maxFields: 1024,
      maxFilesSize: 64 * 1024,
      maxFieldsSize: 64 * 1024
    });
    
    formParser.parse(req, function (err, fields, files) {
      var id, fileSource, role;
      
      if (err) {
        if (err.status === 413) {
          finish(new helpers.WebError(413, err.message));
        } else {
          finish(new helpers.WebError(400, "Invalid form values"));
        }
      }
  
      if (!validateCsrfToken(csrfHmacKey, req.user.id, fields.token ? fields.token[0] : null)) {
        finish(new helpers.WebError(400, "Please reload the page and try again"));
        return;
      }
      
      id = fields.id ? fields.id[0] : null;
      role = fields.role ? fields.role[0] : null;
      fileSource = files.file && files.file[0] && files.file[0].size > 0 ? files.file[0] : null;
      
      if (id == null) {
        finish(new helpers.WebError(400, "Invalid form values"));
        return;
      }
      
      if (fileSource != null) {
        validateUserCert(fileSource, function(err, certificateInfo) {
          var update;
          
          if (err) {
            finish(err);
            return;
          }
          if (id !== certificateInfo.emailAddress) {
            finish(new helpers.WebError(400, "Certificate is for a different email address"));
            return;
          }
          update = {
            id: certificateInfo.emailAddress,
            name: certificateInfo.commonName,
            role: "admin",
            validStart: certificateInfo.validStart,
            validEnd: certificateInfo.validEnd,
            certFingerprint: certificateInfo.certFingerprint
          };
          if (role != null) {
            update.role = role;
          }
          fileSystem.updateUserData(update, finish);
        });
        
      } else {
        if (role == null) {
          finish();
          return;
        }
        fileSystem.updateUserData({id: id, role: role}, finish);
      }
      
      function finish(err) {
        finishFileResponse(res, files, err)
      }
    });
    
  });
  
  if (allowAutoRegister) {
    app.get("/register", function(req, res) {
      var registerAsAdmin = false, adminDeniedReason = null, html = [], urlTarget;
      
      if (req.query.token && req.query.token.length) {
        if (fileSystem.adminUserCount > 0) {
          adminDeniedReason = "the service already has an administrator, and for security reasons only one user can become an administrator via auto-register.";
        } else if (req.query.token !== adminToken) {
          adminDeniedReason = "the admin token you supplied is not valid."
        } else {
          registerAsAdmin = true;
        }
      }
      if (registerAsAdmin) {
        urlTarget = "/register?token=" + req.query.token;
      } else {
        urlTarget = "/register";
      }
  
      html.push('<div class="auto-register">');
      html.push('<h1> Auto-register</h1>');
  
      // We don't have to be defensive in checking these things, because they were already validated in middleware
      var userCertificate = req.socket.getPeerCertificate();
      
      html.push('<p>');
      html.push('email: <strong>' + helpers.toHtml(userCertificate.subject.emailAddress) + '</strong><br/>');
      html.push('Name: <strong>' + helpers.toHtml(userCertificate.subject.CN) + '</strong>');
      html.push('</p>');
      
      if (req.user) {
        if (req.user.role === "admin") {
          html.push('<p>You are already registered as an administrator.<br/><a href="/">Go to management dashboard</a>.</p>');
        } else if (adminDeniedReason) {
          html.push('<p>You are already registered as a user. Although you supplied a token, your role cannot be changed to <strong>Administrator</strong> because ' + helpers.toHtml(adminDeniedReason) + '</p>');
        } else if (registerAsAdmin) {
          html.push('<form action="' + urlTarget + '" method="post">');
          html.push('<p>You are already registered as a <strong>User</strong>, but you can update your role to <strong>Administrator</strong>.</p>');
          html.push('<div class="button-bar"><button type="submit">Register as administrator</button></div>');
          html.push('</form>');
        } else {
          html.push('<p>You are already registered as as a user of this service.</p>');
        }
      } else {
        html.push('<form action="' + urlTarget + '" method="post">');
        if (adminDeniedReason) {
          html.push('<p>You can auto-register as a <strong>User</strong>. Although you supplied a token, you cannot auto-register as an <strong>Administrator</strong> because ' + helpers.toHtml(adminDeniedReason) + '</p>');
        } else if (registerAsAdmin) {
          html.push('<p>You are eligible to auto-register as an <strong>Administrator</strong>.</p>');
        } else {
          html.push('<p>You are eligible to auto-register for the service.</p>');
        }
        html.push('<div class="button-bar"><button type="submit">Register now</button></div>');
        html.push('</form>');
      }
      html.push('</div>');
      
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
      res.send(pageHtml(req, null, html.join("")));
      
    });
    
    app.post("/register", function(req, res) {
      var registerAsAdmin = false;
      
      if (req.user && req.user.role === "admin") {
        res.redirect("/");
        return;
      }
      
      if (req.query.token) {
        if (req.query.token !== adminToken) {
          res.sendStatus(400);
          return;
        }
        if (fileSystem.adminUserCount > 0) {
          res.redirect("/register");
          return;
        }
        registerAsAdmin = true;
      }
      
      if (req.user) {
        if (!registerAsAdmin) {
          
          res.send(pageHtml(req, null, [
            '<div class="auto-register">',
            '<h1>Success!</h1>',
            '<p>You have registered for the service. Please contact an administrator to configure your access.</p>',
            '</div>'
          ].join("")));
          
        } else {
          
          fileSystem.updateUserData({id: req.user.id, role: "admin"}, finishMainAction);
          
        }
        return;
      }
      
      // We don't have to be defensive in checking these things, because they were already validated in middleware
      var userCertificate = req.socket.getPeerCertificate();
      
      fileSystem.addUser({
          id: userCertificate.subject.emailAddress,
          name: userCertificate.subject.CN,
          groups: new Set(),
          role: registerAsAdmin ? "admin" : "user",
          validStart: new Date(Date.parse(userCertificate.valid_from)),
          validEnd: new Date(Date.parse(userCertificate.valid_to)),
          certFingerprint: userCertificate.fingerprint
        },
        finishMainAction
      );
      
      function finishMainAction(err) {
        var errorMessage;
        
        if (err) {
          if (err.htmlErrorCode && err.htmlErrorCode >= 400 && err.htmlErrorCode < 500) {
            errorMessage = err.message;
          } else {
            errorMessage = "Something unexpected went wrong."
          }
          res.status(err.htmlErrorCode || 500).send(pageHtml(req, null, [
            '<h1>Registration error</h1>',
            '<p>' + helpers.toHtml(errorMessage) + '</p>'
          ].join("")));
          return;
        }
        if (registerAsAdmin) {
          res.redirect("/");
          return;
        }
        res.send(pageHtml(req, null, [
          '<div class="auto-register">',
          '<h1>Success!</h1>',
          '<p>You have registered for the service. Please contact an administrator to configure your access.</p>',
          '</div>'
        ].join("")));
      }
    });
  }
  
  
  function validateUserCert(fileSource, callback) {
    fs.readFile(fileSource.path, function(err, fileData) {
      if (err) {
        finish(err);
        return;
      }
      fileSystem.getCertificateInfo(fileData, function(err, certificateInfo) {
        if (err) {
          callback(new helpers.WebError(400, "Could not read certificate"));
          return;
        }
        if (+certificateInfo.validStart > Date.now()) {
          callback(new helpers.WebError(400, "The certificate is not yet valid"));
          return;
        }
        if (+certificateInfo.validEnd < Date.now()) {
          callback(new helpers.WebError(400, "The certificate has expired"));
          return;
        }
        if (!certificateInfo.isVerified) {
          callback(new helpers.WebError(400, "The certificate is not signed by the correct CA"));
          return;
        }
        callback(null, certificateInfo);
      });
    });
  }
  
  return app;
}


function finishFileResponse(res, files, err) {
  var key, i;
  
  if (!err) {
    res.sendStatus(200);
  } else if (err.htmlErrorCode && err.htmlErrorCode >= 400 && err.htmlErrorCode < 500) {
    res.status(err.htmlErrorCode).send(err.message);
  } else {
    res.sendStatus(err.htmlErrorCode || 500);
  }
  
  if (files) {
    for (key in files) {
      if (files.hasOwnProperty(key)) {
        for (i = 0; i < files[key].length; i++) {
          fs.unlink(files[key][i].path, function(err) {
            if (err) {
              console.log(err);
            }
          })
        }
      }
    }
  }
}

function pageHtml(req, includeJs, body) {
  return [
    '<!DOCTYPE html>',
    '<html>',
    '<head>',
    '<title>Secret Server</title>',
    '<link href="/static/admin.css" rel="stylesheet">',
    includeJs ? '<script src="' + includeJs + '"></script>' : '',
    '</head>',
    '<body>',
    '<div class="site-header">',
    req.user ? '<div class="auth-user" data-id="' + req.user.id + '">' + helpers.toHtml(req.user.id) + '</div>' : '',
    '<div class="site-name">Secret Server</div>',
    '</div>',
    '<div id="main-content">',
    body ? body : '',
    '</div>',
    '</body>',
    '</html>'
  ].join("");
}

function parseGroupFields(fields) {
  var i, groups = new Set(), groupName, newGroups;
  
  if (fields.groups) {
    for (i = 0; i < fields.groups.length; i++) {
      if (typeof fields.groups[i] !== "string") {
        return null;
      }
      groupName = fields.groups[i].trim().toLowerCase();
      if (groupName.length) {
        groups.add(groupName);
      }
    }
  }
  
  if (fields.newgroups) {
    if (typeof fields.newgroups[0] !== "string") {
      return null;
    }
    newGroups = fields.newgroups[0].split(" ");
    for (i = 0; i < newGroups.length; i++) {
      groupName = newGroups[i].trim().toLowerCase();
      if (groupName.length) {
        groups.add(groupName);
      }
    }
  }
  
  return groups;
}

function createCsrfToken(key, userId) {
  var plain = Buffer.from(userId).toString('hex') + "|" + (Date.now() + 3600000); // Valid for one hour
  var hmac = crypto.createHmac("sha256", key);
  hmac.update(plain);
  return plain + "|" + hmac.digest('hex');
}

function validateCsrfToken(key, userId, token) {
  var tokenSplit;
  
  if (typeof token !== "string") {
    return false;
  }
  
  tokenSplit = token.split("|", 3);
  if (tokenSplit[0] !== Buffer.from(userId).toString('hex')) {
    return false;
  }
  if (!(parseInt(tokenSplit[1]) > Date.now())) {
    return false
  }
  
  var hmac = crypto.createHmac("sha256", key);
  hmac.update(tokenSplit[0] + "|" + tokenSplit[1]);
  return hmac.digest('hex') === tokenSplit[2];
}

exports.create = create;