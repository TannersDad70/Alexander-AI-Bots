# Deployments

One directory per deployment. Each holds the page shell that deployment serves
(`branded/index.html`) — the artwork beside it comes from `../branding/assets/`.

Changes here are published by the timer on the deployment host
(`services/deploy-from-repo.sh` in the working tree, `bin/deploy-from-repo.sh`
on the machine): it copies each shell into that deployment's `branded/`
directory and the artwork beside it. Nothing is restarted — the shell and the
artwork are files the web server reads on every request.
