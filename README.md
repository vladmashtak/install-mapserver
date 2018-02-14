# Local Tile Server 

## Install Node.js:

`make install-node`

## Install dependencies for the project:

`make install-tileserver`

## Download Map

Download map form [openmaptiles.com](https://openmaptiles.com/downloads/planet/) and save in project folder

## Create tileserver service:

`map=...` and `port=...` `prefix=...` `protocol=(http/https)`is required!

`make map=example_map.mbtiles port=9000 prefix=map protocol=https tileserver.service`

## Tile service

### Start service

`systemctl start tileserver.service`

### Check status

`systemctl status tileserver.service`

### Enable autostart service

`systemctl enable tileserver.service`