#!/usr/bin/env node

const usage = `
Usage:
       solana gossip -v | vdump.js [-max <max>] [-oi] [-csv] [-s] [-v]

       -max <number> 
   
           Only show fewer than <max> nodes at location

       -oi 
  
           Output node ids only

       -csv

           Comma separated

       -s

           Summary only 

       -v 

           debug output

Examples: 

       # list of nodes at location with up to 2 nodes

       solana gossip -v | vdump.js -max 2

       # list of node IDs at location with up to 3 nodes 

       solana gossip -v > x.x
       vdump.js x.x -g -max 3 -oi 

       # locations and node counts only, in csv format

       solana gossip -v | vdump.js -s -csv
   

Requires node + solana cli tools + traceroute 
  - sudo apt install nodejs
  - https://docs.solana.com/cli/install-solana-cli-tools

You must install the JavaScript dependencies:
npm install 
`

const ASN_FIELD_CHAR = 50
const NODE_FIELD_CHAR = 50
const IP_FIELD_CHAR = 20

async function main() {
  
  const fs = require("fs")
  const args = require('command-line-parser')()

  if ( args.oi && args.csv ) {
    console.log("Cannot specify -oi and -csv")
    process.exit(1)
  } 

  if ( args.oi && args.s) {
    console.log("Cannot specify -oi and -s")
    process.exit(1)
  } 

  let input

  if( args._args && args._args.length > 0 ) {
    // read file
    const file = args._args[0]
    if ( !fs.existsSync(file) ) {
      console.log("File not found:",file)
      process.exit(1)
    }
    var buff = fs.readFileSync(file) 
    input = buff.toString() 
  } else {
    // read stdin
    var stdinBuffer = fs.readFileSync(0) // STDIN_FILENO = 0
    input = stdinBuffer.toString() 
  }
  
  if (!input) {
    console.log("No data to work on")
    process.exit(1)
  }

  
  let waiton = []
  
  const lines = input.split(/\r?\n/)
  
  for( let i=0; i<lines.length; i++ ) {
    const line = lines[i]
    const parts = line.split('|')
    if( !parts[0] || !parts[1] || !parts[2] ) { continue } 
    const nodeIP = parts[0].trim() 
    const nodeID = parts[1].trim() 
    const gossipPort = parts[2].trim() 
    if( !validIP( nodeIP )) { continue }
    if ( args.v ) { console.log("Querying:",nodeID,nodeIP) }
    waiton.push( execQuery( nodeID, nodeIP, gossipPort ) )
  }

  if ( args.v ) { console.log("Waiting on",waiton.length,"queries") } 
  
  const responses = await Promise.all( waiton )
 
  let summary = {}
 
  let nodesGrouped = {}

  for( let i=0; i<responses.length; i++ ) {
    const response = responses[i]    
    if ( args.v && !response.ok ) {
      console.log("Error executing cmd:",response.cmd,"for node:",response.nodeID,"Error:",response.err)
      continue
    }
    if ( args.v && !response.out ) {
      console.log("Error executing cmd:",response.cmd,"for node:",response.nodeID,"No output")
      continue
    }
    if ( response.ok ) {

      const asn = response.out

      ++summary[asn] || (summary[asn]=1)

      nodesGrouped[response.nodeID] = { nodeIP: response.nodeIP, asn } 
    }
  }
  
  if ( args.s ) {

    console.log()
    console.log("Summary counts of nodes at locations:")
    console.log()
    if ( args.csv ) {
      console.log("location,nodes_at_location")
      ascSumDo( summary, (asn,count) => { console.log(asn+","+count) } )
    } else {
      console.log("location".padEnd(ASN_FIELD_CHAR," "),"nodes_at_location")
      ascSumDo( summary, (asn,count) => { console.log(asn.padEnd(ASN_FIELD_CHAR," ").substr(0,ASN_FIELD_CHAR),count) } )
    }
    console.log()
    process.exit(0)
  }

  Object.keys(nodesGrouped).forEach(function (nodeID) { 
    nodesGrouped[nodeID].count = summary[ nodesGrouped[nodeID].asn ] 
  })

  if ( args.max ) {
    Object.keys(nodesGrouped).forEach(function (nodeID) { 
      if ( nodesGrouped[nodeID].count > args.max ) {
        delete nodesGrouped[nodeID]
      }
    })
  } 

  if ( args.csv ) {
    console.log("nodeID,nodeIP,location,nodes_at_location")
    ascItemDo( nodesGrouped, (nodeID,entry) => { 
      console.log(nodeID+ ","+ entry.nodeIP+ ","+ entry.asn+ ","+ entry.count) 
    })
  } else {
    if ( args.oi ) {
      ascItemDo( nodesGrouped, (nodeID,_) => { console.log('- '+nodeID) } )
    } else {
      console.log("nodeID".padEnd(NODE_FIELD_CHAR," "),"nodeIP".padEnd(IP_FIELD_CHAR," "),"location".padEnd(ASN_FIELD_CHAR," "),"nodes_at_location")
      ascItemDo( nodesGrouped, (nodeID,entry) => { 
        console.log(nodeID.padEnd(NODE_FIELD_CHAR," ").substr(0,NODE_FIELD_CHAR),
                    entry.nodeIP.padEnd(IP_FIELD_CHAR," ").substr(0,IP_FIELD_CHAR),
                    entry.asn.padEnd(ASN_FIELD_CHAR," ").substr(0,ASN_FIELD_CHAR),
                    entry.count)
      })
    }
  }
      
  process.exit(0)
  
}

main()
  .catch(err => {
    console.error(err)
  })
  .then(() => process.exit())



function getDN( str ) {
  return str.match(/[\w-]+\.\w* /)[0].trim()
}

function ascSumDo( hash, func ) {

  var keys = Object.keys(hash);
  keys.sort(function(a, b) {
    return hash[a] - hash[b]
  })

  keys.forEach(function(k) {
    func(k,hash[k])
  })
} 
  
function ascItemDo( hash, func ) {

  var keys = Object.keys(hash);
  keys.sort(function(a, b) {
    return hash[a].nodeIP - hash[b].nodeIP
  })

  keys.forEach(function(k) {
    func(k,hash[k])
  })
} 
  
function execQuery(nodeID, nodeIP) {
  const cmd = 'whois -h bgp.tools " -v '+nodeIP+'" | tail -1 | cut -d"|" -f7'
  const exec = require('child_process').exec
  return new Promise((resolve, reject) => {
    exec(cmd, (error, stdout, stderr) => {
     resolve(stdout? {ok: true, nodeID, nodeIP, cmd, out: stdout.trim() } : {ok: false, nodeID, cmd, err: stderr } )
    })
  })
}


function validIP(ipaddress) {
 if (/^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(ipaddress)) {
    return true
  }
  return false
}

function validPort(port) {
  if (/\d{5}/.test(port) ) {
    return true
  }
  return false
}



