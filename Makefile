BASEDIR = $(CURDIR)

.PHONY: all

all: install-systemd install-tileserver install-systemd

install-node:
	bash -c "echo 'export PATH=$HOME/local/bin:$PATH' >> ~/.bashrc; . ~/.bashrc; mkdir ~/local; mkdir ~/node-latest-install; cd ~/node-latest-install; curl http://nodejs.org/dist/node-latest.tar.gz | tar xz --strip-components=1; ./configure --prefix=$HOME/local; make install; curl -L https://www.npmjs.com/install.sh | sh"

install-tileserver:
	bash -c "npm install; cd ./node_modules/tileserver-gl-light; npm install"

install-systemd:
	install -D tileserver.service /etc/systemd/system/tileserver.service
	sed 's/@@MAP@@/$(map)/g;s#@@BASEDIR@@#$(BASEDIR)#g' -i \
		/etc/systemd/system/tileserver.service