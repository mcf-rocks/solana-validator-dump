# Find the datacenters the Solana nodes are at

Full list:
```
solana gossip -v | vdump.js 
```

Totals at locations:
```
solana gossip -v | vdump.js -s 
```

Nodes at locations with at most 2 nodes:
```
solana gossip -v | vdump.js -max 2
````

YAML list of the same nodeIDs
```
solana gossip -v | vdump.js -max 2 -oi

```
