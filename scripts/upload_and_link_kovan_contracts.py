# -*- coding: utf-8 -*-
"""
@author: Jeff Wentworth, Dan Briskin, Curvegrid Inc.
"""

import requests
import json
import re

# MultiBaas API key (keep secret!) and endpoint
multibaasAPIKey = ""
multibaasEndpoint = "http://localhost:8080/api/v0"

def handleHTTPErrors(response):
    if response.status_code < 200 or response.status_code > 299:
        print(response.content)

def uploadAndLinkContractToMultiBaas(address, contract):
    headers = {
        "Authorization": "Bearer " + multibaasAPIKey,
        "Content-Type": "application/json"
    }

    # upload the contract
    print("   - Uploading contract to MultiBaas")
    response = requests.post(multibaasEndpoint+"/contracts/"+contract["label"], headers=headers, json=contract)
    handleHTTPErrors(response)

    # label the address
    labelAddress = {
        "label": contract["label"],
        "address": address
    }
    print("   - Labelling the address '"+address+"' as '"+labelAddress["label"]+"'")
    response = requests.post(multibaasEndpoint+"/chains/ethereum/addresses", headers=headers, json=labelAddress)
    handleHTTPErrors(response)

    # link the address
    print("   - Linking the address to the contract")
    response = requests.put(multibaasEndpoint+"/chains/ethereum/addresses/"+address+"/contracts/"+contract["label"]+"/"+contract["version"], headers=headers)
    handleHTTPErrors(response)

def loadContractData():
    contractArray = []
    with open('./json/kovan-releaseB.json') as json_file:
        data = json.load(json_file)
        contractData = data['contracts']
        for contractName in contractData.keys():
            contractItem = {
                "contractName": contractName,
                "label": re.sub(' +', ' ', re.sub(r'(?<!^)(?=[A-Z])', '_', contractName)).lower(),
                "address": contractData[contractName]['address'],
                "rawAbi": json.dumps(contractData[contractName]['abi']),
                "version": "1.0",
                "bin": "0x",
                "developerDoc": "{}",
                "userDoc": "{}",
                "language": "solidity"
            }
            contractArray.append(contractItem)
    return contractArray

contracts = loadContractData()
for contract in contracts:
    contractName = contract['contractName']
    print("Processing contract '"+contractName+"'")

    # upload the contract to MultiBaas
    uploadAndLinkContractToMultiBaas(contract['address'], contract)
