BASEDIR = $(CURDIR)

.PHONY: all

all: install-systemd install-tileserver install-systemd

install-node:
	bash -c ./install-node.sh

install-tileserver:
	bash -c ./install-tileserver.sh

install-systemd:
	install -D tileserver.service /etc/systemd/system/tileserver.service
	sed 's/@@MAP@@/$(map)/g;s#@@BASEDIR@@#$(BASEDIR)#g' -i \
		/etc/systemd/system/tileserver.service