BASEDIR = $(CURDIR)

.PHONY: all

all: install-systemd

install-node:
	install-node.sh

install-systemd:
	install -D tileserver.service $(BASEDIR)/etc/systemd/system/tileserver.service
	sed 's/@@MAP@@/$(map)/g;s#@@BASEDIR@@#$(BASEDIR)#g' -i \
		$(BASEDIR)/etc/systemd/system/tileserver.service