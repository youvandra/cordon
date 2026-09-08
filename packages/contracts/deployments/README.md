# Deployments

One file per chain, written by `scripts/record-deployment.mjs` from the
broadcast that forge produced. Nothing else in this repository hardcodes a
deployed address, and nothing here is typed by hand — a mistyped address is the
kind of defect that looks like a working system right up until the first draw.

`usdc` and `gateway` are not ours and were not deployed by us. They are
recorded so a reader can see what the vault was pointed at without reading a
constructor argument off a block explorer.

To deploy:

```bash
cast wallet import cordon-deployer --interactive   # once; the key stays encrypted
./script/deploy.sh
```

The private key is never an argument to that script, never an environment
variable, and never in your shell history. Foundry holds it in an encrypted
keystore and asks for the password when it needs to sign.
