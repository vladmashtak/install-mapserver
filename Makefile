BASEDIR = $(CURDIR)

.PHONY: all

all: install-systemd install-tileserver install-systemd

install-node:
	bash -c ./install-node.sh

install-tileserver:
	bash -c "npm install; cd ~/node_modules/tileserver-gl-light; npm install"

install-systemd:
	install -D tileserver.service /etc/systemd/system/tileserver.service
	sed 's/@@MAP@@/$(map)/g;s#@@BASEDIR@@#$(BASEDIR)#g' -i \
		/etc/systemd/system/tileserver.service