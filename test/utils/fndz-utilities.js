/* eslint-disable @typescript-eslint/no-var-requires */
const { ethers } = require('hardhat');
const { newFundCreatedABI } = require('./event-signatures');
/* eslint-enable @typescript-eslint/no-var-requires */

const emptyConfigData =
  '0x0000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

// Event ABIs
const sharesRedeemedABI =
  'event SharesRedeemed(address indexed redeemer, uint256 sharesQuantity, address[] receivedAssets, uint256[] receivedAssetQuantities, bool isVirtual)';
const transferABI = 'event Transfer(address indexed from, address indexed to, uint256 value)';
const performanceFeeFundSettingsAddedEventABI =
  'event FundSettingsAdded(address indexed comptrollerProxy, uint256 rate, uint256 period)';
const takeOrderABI = 'function takeOrder(address _vaultProxy,bytes calldata _encodedCallArgs,bytes calldata)';
const comptrollerProxyDeployedEventABI =
  'event ComptrollerProxyDeployed(address indexed creator,address comptrollerProxy,address indexed denominationAsset,uint256 sharesActionTimelock,bytes feeManagerConfigData,bytes policyManagerConfigData,bool indexed forMigration)';

async function createRandomAddress() {
  return ethers.Wallet.createRandom();
}

function filterEvents(receipt, eventName) {
  return receipt.events.filter((x) => {
    return x.event == eventName;
  });
}

function extractEventArgs(receipt, eventName) {
  const events = filterEvents(receipt, eventName);
  if (events.length == 0) {
    throw new Error(`extractEventArgs: ${eventName} not found`);
  } else if (events.length > 1) {
    throw new Error(`extractEventArgs: multiple ${eventName} events found`);
  }
  const { args } = events[0];
  return args;
}

function filterEventsByABI(receipt, abi) {
  const interface = new ethers.utils.Interface(abi);
  return receipt.logs.reduce((filteredLogs, log) => {
    let matchedLog;
    try {
      matchedLog = interface.parseLog(log);
    } catch {}
    if (matchedLog) {
      filteredLogs.push(matchedLog);
    }
    return filteredLogs;
  }, []);
}

// Convenience method for extracting comptrollerProxy and vaultProxy address
// from receipt of FNDZController createNewFund method
function getFundAddresses(newFundCreatedReceipt) {
  return filterEventsByABI(newFundCreatedReceipt, [newFundCreatedABI])[0].args;
}

function bnArrayDeepEqual(a, b) {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]._hex !== b[i]._hex || a[i]._isBigNumber !== b[i]._isBigNumber) {
      return false;
    }
  }
  return true;
}

async function advanceTime(amount) {
  const now = (await ethers.provider.getBlock('latest')).timestamp;
  await ethers.provider.send('evm_setNextBlockTimestamp', [now + amount]);
  // await ethers.provider.send('evm_mine');
}

// ParaSwapV5 Path type for Encode
const paraSwapV5CallArgsEncodeType = [
  'uint256',
  'uint256',
  'address',
  'uint256',
  'bytes16',
  'address',
  'uint256',
  'tuple(address, uint256, tuple(address, uint256, uint256, tuple(uint256, address, uint256, bytes, uint256)[])[])[]',
];

module.exports = {
  createRandomAddress,
  emptyConfigData,
  filterEvents,
  extractEventArgs,
  filterEventsByABI,
  getFundAddresses,
  bnArrayDeepEqual,
  advanceTime,
  sharesRedeemedABI,
  transferABI,
  performanceFeeFundSettingsAddedEventABI,
  takeOrderABI,
  comptrollerProxyDeployedEventABI,
  paraSwapV5CallArgsEncodeType,
};
