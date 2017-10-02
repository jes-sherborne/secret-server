const express = require("express");
const propfindRequest = require("./propfind-request");
const rawBody = require("raw-body");
const contentType = require("content-type");
const zlib = require("zlib");

// List of DAV methods we understand. Since our server is read-only, we return a Locked indicator to any request that
// could mutate state. Methods marked with `true` are explicitly handled.

const methods = {
  GET: true,
  HEAD: true,
  PROPFIND: true,
  OPTIONS: true,
  PROPPATCH: false,
  MKCOL: false,
  POST: false,
  DELETE: false,
  PUT: false,
  COPY: false,
  MOVE: false,
  LOCK: false,
  UNLOCK: false
};

const allowedMethods = Object.keys(methods).join(", ");

// List of DAV properties we support.
// Despite the name, PROPFIND -> allprop isn't required to return all properties,
// see http://www.webdav.org/specs/rfc4918.html#rfc.section.9.1.5 for details.

const supportedProperties = {
  creationdate: {allprop: true},
  displayname: {allprop: true},
  getcontentlength: {allprop: true},
  getcontenttype: {allprop: true},
  getetag: {allprop: true},
  getlastmodified: {allprop: true},
  lockdiscovery: {allprop: true},
  resourcetype: {allprop: true},
  supportedlock: {allprop: true}
};

function create(options, middleware) {
  const app = express();
  const fileSystem = options.fileSystem;
  
  middleware = (middleware || []).concat([function(req, res, next) {
    if (!req.user) {
      res.sendStatus(403);
      return;
    }
    next();
  }]);
  app.use(middleware);
  
  app.all("*", onRequest);
  
  return app;
  
  function onRequest(req, res, next) {
    if (!req.user) {
      res.sendStatus(500); // Should have been caught by middleware
      return;
    }
    
    if (methods[req.method] == null) {
      res.sendStatus(405); // Invalid method
      return;
    }
    
    if (req.method === "OPTIONS") {
      res.setHeader("Allow", allowedMethods);
      res.setHeader("DAV", "1, 2");
      res.sendStatus(200);
      return;
    }
    
    if (!fileSystem.userHasFile(req.user, req.path)) {
      res.sendStatus(404); // Not found
      return;
    }
  
    if (methods[req.method] === false) {
      res.sendStatus(423); // Locked
      return;
    }
    
    switch (req.method) {
      case "GET":
        onGet(req, res, false);
        return;
      case "HEAD":
        onGet(req, res, true);
        return;
      case "PROPFIND":
        onPropfind(req, res, next);
        return;
    }
    res.sendStatus(405);
  }
  
  function onGet(req, res, headOnly) {
    var target;
  
    target = fileSystem.userGetFile(req.user, req.path);
    if (!target) {
      res.sendStatus(404); // Not found
      return;
    }
    
    res.statusCode = 200;
    res.setHeader("Cache-Control", "private, max-age=3600");
    res.setHeader("Last-Modified", target.modifiedAt.toUTCString());
    res.setHeader("Vary", "Accept-Encoding");
    res.setHeader("Content-Type", target.contentType);
    
    if (headOnly || req.fresh) {
      res.send("");
      return;
    }
    target.getValue(function(err, value) {
      if (err) {
        res.sendStatus(500); // Server error
        return;
      }
    
      if (req.acceptsEncoding("gzip")) {
        res.setHeader("ETag", target.etag + "_gz");
        res.setHeader("Content-Encoding", "gzip");
        zlib.gzip(value, function(err, compressed) {
          if (err) {
            res.sendStatus(500); // Server error
            return;
          }
          res.setHeader("Content-Length", compressed.length);
          res.send(compressed);
        })
      } else if (req.acceptsEncoding("deflate")) {
        res.setHeader("ETag", target.etag + "_df");
        res.setHeader("Content-Encoding", "deflate");
        zlib.deflate(value, function(err, compressed) {
          if (err) {
            res.sendStatus(500); // Server error
            return;
          }
          res.setHeader("Content-Length", compressed.length);
          res.send(compressed);
        })
      } else {
        res.setHeader("ETag", target.etag );
        res.setHeader("Content-Encoding", "identity");
        res.setHeader("Content-Length", target.contentLength);
        res.send(value);
      }
    });
  }
  
  function onPropfind(req, res, next) {
    getRawBody(req, res, next, function() {
      var response;
      propfindRequest.createFromRequest(req, supportedProperties, function(err, command) {
        if (err) {
          res.sendStatus(500); // Server error
          return;
        }
        if (command.isError) {
          res.sendStatus(400); // Server error
          return;
        }
        response = propfindXml(req, fileSystem, command);
        res.send(response);
      });
    });
  }
}

function getRawBody(req, res, next, callback) {
  rawBody(req, {
    length: req.headers['content-length'],
    limit: '5kb',
    encoding: contentType.parse(req).parameters.charset || "utf-8"
  }, function(err, result) {
    if (err) {
      next(err);
      return;
    }
    req.rawBody = result;
    callback();
  });
}

function propfindXml(req, fileSystem, command) {
  var result = [], missingPropsXmlSnippet, topUrl, lockUrl;
  
  // path has already been validated
  topUrl = req.protocol + "://" + req.headers.host + req.baseUrl;
  lockUrl = topUrl + fileSystem.fileRoot.path;
  
  if (command.unknownProps) {
  }
  
  result.push('<?xml version="1.0" encoding="utf-8" ?>');
  result.push('<multistatus xmlns="DAV:">');
  
  if (!command.propName) {
    missingPropsXmlSnippet = missingPropsXml(command.unknownProps);
  }
  
  if (req.path === "/") {
    
    if (command.propName) {
      result.push(entityPropNameXml(fileSystem.fileRoot, topUrl));
    } else {
      result.push(entityPropfindXml(fileSystem.fileRoot, command.props, missingPropsXmlSnippet, topUrl, lockUrl));
    }
    
    if (command.depth !== 0) {
      fileSystem.userForEachFile(req.user, function(file) {
        if (command.propName) {
          result.push(entityPropNameXml(file, topUrl));
        } else {
          result.push(entityPropfindXml(file, command.props, missingPropsXmlSnippet, topUrl, lockUrl));
        }
      });
    }
    
  } else {
    if (command.propName) {
      result.push(entityPropNameXml(fileSystem.userGetFile(req.user, req.path), topUrl));
    } else {
      result.push(entityPropfindXml(fileSystem.userGetFile(req.user, req.path), command.props, missingPropsXmlSnippet, topUrl, lockUrl));
    }
  }
  
  result.push('</multistatus>');
  
  return result.join("");
}


function entityPropfindXml(target, props, missingPropsXmlSnippet, topUrl, lockUrl) {
  var result = [], i, v, interior = [];
  
  result.push('<response>');
  
  result.push('<href>' + topUrl + target.path + '</href>');
  
  for (i = 0; i < props.length; i++) {
    v = propfindPropertyXml(props[i], target, lockUrl);
    if (isNonBlank(v)) {
      interior.push(v);
    }
  }
  result.push(propstatCoreXml(interior.join(""), 200));
  
  if (isNonBlank(missingPropsXmlSnippet)) {
    result.push(missingPropsXmlSnippet);
  }
  
  result.push('</response>');
  return result.join("");
}


function propfindPropertyXml(propName, target, lockUrl) {
  switch (propName) {
    case "creationdate":
      return '<creationdate>' + target.createdAt.toISOString() + '</creationdate>';
    case "displayname":
      return '<displayname>' + target.id + '</displayname>';
    case "getcontentlength":
      return '<getcontentlength>' + target.contentLength.toString() + '</getcontentlength>';
    case "getcontenttype":
      return '<getcontenttype>' + target.contentType + '</getcontenttype>';
    case "getetag":
      return '<getetag>"' + target.etag + '"</getetag>';
    case "getlastmodified":
      return '<getlastmodified>' + target.modifiedAt.toUTCString() + '</getlastmodified>';
    case "resourcetype":
      return target.isDirectory ? '<resourcetype><collection/></resourcetype>' : '<resourcetype/>';
    case "lockdiscovery":
      return [
        '<lockdiscovery>',
        '<activelock>',
        '<locktype><write/></locktype>',
        '<lockscope><exclusive/></lockscope>',
        '<depth>infinity</depth>',
        '<timeout>Second-2592000</timeout>',
        '<lockroot><href>' + lockUrl + '</href></lockroot>',
        '</activelock>',
        '</lockdiscovery>'
      ].join("");
    case "supportedlock":
      return [
        '<supportedlock>',
        '<lockentry>',
        '<lockscope><exclusive/></lockscope>',
        '<locktype><write/></locktype>',
        '</lockentry>',
        '<supportedlock>'
      ].join("");
    default:
      return '';
  }
}

function missingPropsXml(missingProps) {
  var i, interior = [];
  
  if (!isNonBlank(missingProps)) {
    return "";
  }
  
  for (i = 0; i < missingProps.length; i++) {
    interior.push('<' + missingProps[i] + '/>');
  }
  return propstatCoreXml(interior.join(""), 404);
}

function entityPropNameXml(target, topUrl) {
  var result = [], key, interior = [];
  
  result.push('<response>');
  
  result.push('<href>' + topUrl + target.path + '</href>');
  
  for (key in supportedProperties) {
    if (supportedProperties.hasOwnProperty(key)) {
      interior.push('<' + key + '/>');
    }
  }
  result.push(propstatCoreXml(interior.join(""), 200));
  
  result.push('</response>');
  
  return result.join("");
}

function propstatCoreXml(content, status) {
  var statusLine;
  
  switch (status) {
    case 200:
      statusLine = "HTTP/1.1 200 OK";
      break;
    case 404:
      statusLine = "HTTP/1.1 404 Not Found";
      break;
    default:
      throw new Error ("Missing status");
  }
  return [
    '<propstat>',
    '<prop>',
    content,
    '</prop>',
    '<status>',
    statusLine,
    '</status>',
    '</propstat>'
  ].join("");
}

function isNonBlank(v) {
  if (v == null) {
    return false;
  }
  return v.length > 0;
}

exports.create = create;
