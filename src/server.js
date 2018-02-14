#!/usr/bin/env node
'use strict';

process.env.UV_THREADPOOL_SIZE =
    Math.ceil(Math.max(4, require('os').cpus().length * 1.5));

var fs = require('fs'),
    path = require('path');

var base64url = require('base64url'),
    clone = require('clone'),
    cors = require('cors'),
    enableShutdown = require('http-shutdown'),
    express = require('express'),
    handlebars = require('handlebars'),
    mercator = new (require('@mapbox/sphericalmercator'))(),
    morgan = require('morgan');

var packageJson = require('../package'),
    serve_font = require('./serve_font'),
    serve_style = require('./serve_style'),
    serve_data = require('./serve_data'),
    utils = require('./utils');

var isLight = packageJson.name.slice(-6) == '-light';

function start(opts) {
  console.log('Starting server');

  var app = express().disable('x-powered-by'),
      serving = {
        styles: {},
        rendered: {},
        data: {},
        fonts: {}
      };

  var router = express.Router();

  app.enable('trust proxy');

  if (process.env.NODE_ENV == 'production') {
    app.use(morgan('tiny'));
  } else if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('dev'));
  }

  var config = opts.config || null;
  var configPath = null;
  if (opts.configPath) {
    configPath = path.resolve(opts.configPath);
    try {
      config = clone(require(configPath));
    } catch (e) {
      console.log('ERROR: Config file not found or invalid!');
      console.log('       See README.md for instructions and sample data.');
      process.exit(1);
    }
  }
  if (!config) {
    console.log('ERROR: No config file not specified!');
    process.exit(1);
  }

  var options = config.options || {};
  var paths = options.paths || {};
  options.paths = paths;
  paths.root = path.resolve(
    configPath ? path.dirname(configPath) : process.cwd(),
    paths.root || '');
  paths.styles = path.resolve(paths.root, paths.styles || '');
  paths.fonts = path.resolve(paths.root, paths.fonts || '');
  paths.sprites = path.resolve(paths.root, paths.sprites || '');
  paths.mbtiles = path.resolve(paths.root, paths.mbtiles || '');

  var startupPromises = [];

  var checkPath = function(type) {
    if (!fs.existsSync(paths[type])) {
      console.error('The specified path for "' + type + '" does not exist (' + paths[type] + ').');
      process.exit(1);
    }
  };
  checkPath('styles');
  checkPath('fonts');
  checkPath('sprites');
  checkPath('mbtiles');

  if (options.dataDecorator) {
    try {
      options.dataDecoratorFunc = require(path.resolve(paths.root, options.dataDecorator));
    } catch (e) {}
  }

  var data = clone(config.data || {});

  app.use(cors());

  Object.keys(config.styles || {}).forEach(function(id) {
    var item = config.styles[id];
    if (!item.style || item.style.length == 0) {
      console.log('Missing "style" property for ' + id);
      return;
    }

    if (item.serve_data !== false) {
      startupPromises.push(serve_style(options, serving.styles, item, id,
        function(mbtiles, fromData) {
          var dataItemId;
          Object.keys(data).forEach(function(id) {
            if (fromData) {
              if (id == mbtiles) {
                dataItemId = id;
              }
            } else {
              if (data[id].mbtiles == mbtiles) {
                dataItemId = id;
              }
            }
          });
          if (dataItemId) { // mbtiles exist in the data config
            return dataItemId;
          } else if (fromData) {
            console.log('ERROR: data "' + mbtiles + '" not found!');
            process.exit(1);
          } else {
            var id = mbtiles.substr(0, mbtiles.lastIndexOf('.')) || mbtiles;
            while (data[id]) id += '_';
            data[id] = {
              'mbtiles': mbtiles
            };
            return id;
          }
        }, function(font) {
          serving.fonts[font] = true;
        }, opts.prefix).then(function(sub) {
          router.use('/styles/', sub);
        }));
    }

  });

  startupPromises.push(
    serve_font(options, serving.fonts).then(function(sub) {
      router.use('/', sub);
    })
  );

  Object.keys(data).forEach(function(id) {
    var item = data[id];
    if (!item.mbtiles || item.mbtiles.length == 0) {
      console.log('Missing "mbtiles" property for ' + id);
      return;
    }

    startupPromises.push(
      serve_data(options, serving.data, item, id, serving.styles, opts.prefix).then(function(sub) {
        router.use('/data/', sub);
      })
    );
  });

  router.get('/styles.json', function(req, res, next) {
    var protocol = req.connection.encrypted ? 'https://' : 'http://';
    var result = [];
    var query = req.query.key ? ('?key=' + req.query.key) : '';
    Object.keys(serving.styles).forEach(function(id) {
      var styleJSON = serving.styles[id],
          styleUrl;

        if (!!opts.prefix ) {
          styleUrl = protocol + req.headers.host + opts.prefix + '/styles/' + id + '/style.json' + query;
        } else {
          styleUrl = protocol + req.headers.host + '/styles/' + id + '/style.json' + query;
        }

      result.push({
        version: styleJSON.version,
        name: styleJSON.name,
        id: id,
        url: styleUrl
      });
    });
    res.send(result);
  });

  var addTileJSONs = function(arr, req, type) {
    Object.keys(serving[type]).forEach(function(id) {
      var info = clone(serving[type][id]);
      var path = '';
      if (type == 'rendered') {
        path = 'styles/' + id;
      } else {
        path = type + '/' + id;
      }
      info.tiles = utils.getTileUrls(req, info.tiles, path, info.format, {'pbf': options.pbfAlias}, opts.prefix);
      arr.push(info);
    });
    return arr;
  };

  router.get('/rendered.json', function(req, res, next) {
    res.send(addTileJSONs([], req, 'rendered'));
  });
  router.get('/data.json', function(req, res, next) {
    res.send(addTileJSONs([], req, 'data'));
  });
  router.get('/index.json', function(req, res, next) {
    res.send(addTileJSONs(addTileJSONs([], req, 'rendered'), req, 'data'));
  });

  //------------------------------------
  // serve web presentations
  router.use('/', express.static(path.join(__dirname, '../public/resources')));

  var startupComplete = false;
  var startupPromise = Promise.all(startupPromises).then(function() {
    console.log('Startup complete');
    startupComplete = true;
  });
  router.get('/health', function(req, res, next) {
    if (startupComplete) {
      return res.status(200).send('OK');
    } else {
      return res.status(503).send('Starting');
    }
  });

  if (!!opts.prefix) {
    app.use(opts.prefix, router);
  } else {
    app.use(router);
  }

  var server = app.listen(process.env.PORT || opts.port, process.env.BIND || opts.bind, function() {
    var address = this.address().address;
    if (address.indexOf('::') === 0) {
      address = '[' + address + ']'; // literal IPv6 address
    }
    console.log('Listening at http://%s:%d/', address, this.address().port);

    if (!!opts.prefix)
      console.log('Prefix: ', opts.prefix);
  });

  // add server.shutdown() to gracefully stop serving
  enableShutdown(server);

  return {
    app: app,
    server: server,
    startupPromise: startupPromise
  };
}

module.exports = function(opts) {
  var running = start(opts);

  running.startupPromise.catch(function(err) {
    console.error(err.message);
    process.exit(1);
  });

  process.on('SIGINT', function() {
    process.exit();
  });

  process.on('SIGHUP', function() {
    console.log('Stopping server and reloading config');

    running.server.shutdown(function() {
      for (var key in require.cache) {
        delete require.cache[key];
      }

      var restarted = start(opts);
      running.server = restarted.server;
      running.app = restarted.app;
    });
  });

  return running;
};
