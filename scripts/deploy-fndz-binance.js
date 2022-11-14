// hre is undefined if we try to require it here, leaving it commented out for now
// eslint-disable-next-line @typescript-eslint/no-var-requires
// const { hre } = require('hardhat');
// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
/* eslint-disable @typescript-eslint/no-var-requires */
const { verifyContract } = require('./utils/verifyContract');

const dependencies = {
  // ChainLinkPriceFeed
  WBNBToken: '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c', // https://bscscan.com/address/0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c#code
  WBNBUSDAggregator: '0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE', // https://bscscan.com/address/0x0567F2323251f0Aab15c8dFb1967E4e8A7D42aeE#code

  // ParaSwapV5Adapter
  augustusSwapper: '0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57', // https://bscscan.com/address/0xDEF171Fe48CF0115B1d80b88dc8eAB59176FEe57#code
  tokenTransferProxy: '0x216B4B4Ba9F3e719726886d34a177484278Bfcae', // https://bscscan.com/address/0x216B4B4Ba9F3e719726886d34a177484278Bfcae#code,

  // FNDZController (InlineSwap)
  uniswapV2Router02: '0x10ED43C718714eb63d5aA57B78B54704E256024E', // https://bscscan.com/address/0x10ed43c718714eb63d5aa57b78b54704e256024e#code
  uniswapV2Factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73', // https://bscscan.com/address/0xca143ce32fe78f1f7019d7d551a6402fc5350c73#code

  // FNDZ Token
  fndzToken: '0x7754c0584372D29510C019136220f91e25a8f706', // https://bscscan.com/address/0x7754c0584372D29510C019136220f91e25a8f706#code

  // FNDZ DAO Address
  fndzDao: '0xBCABFA031Aeda37C000cd712208f0396a8511a76', // https://bscscan.com/address/0xBCABFA031Aeda37C000cd712208f0396a8511a76#code

  // FNDZ Ownership address
  fndzOwner: '0x52f1DCdd06941a426B78ACA777f4D83d9e88159b',

  // Chainlink Node Oracle address
  chainlinkOracle: '0x0160231B574B6f07E5f91CB6828064cE2F27cDc1',
};

// ERC20 Tokens
const tokens = {
  ADA: '0x3EE2200Efb3400fAbB9AacF31297cBdD1d435D47',
  ALPACA: '0x8F0528cE5eF7B51152A59745bEfDD91D97091d2F',
  ALPHA: '0xa1faa113cbE53436Df28FF0aEe54275c13B40975',
  ARPA: '0x6F769E65c14Ebd1f68817F5f1DcDb61Cfa2D6f7e',
  ATOM: '0x0Eb3a705fc54725037CC9e008bDede697f62F335',
  AXS: '0x715D400F88C167884bbCc41C5FeA407ed4D2f8A0',
  BAND: '0xAD6cAEb32CD2c308980a548bD0Bc5AA4306c6c18',
  BCH: '0x8fF795a6F4D97E7887C79beA79aba5cc76444aDf',
  BETH: '0x250632378E573c6Be1AC2f97Fcdf00515d0Aa91B',
  BIFI: '0xCa3F508B8e4Dd382eE878A314789373D80A5190A',
  BTCB: '0x7130d2A12B9BCbFAe4f2634d864A1Ee1Ce3Ead9c',
  BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
  CAKE: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
  CHR: '0xf9CeC8d50f6c8ad3Fb6dcCEC577e05aA32B224FE',
  COMP: '0x52CE071Bd9b1C4B00A0b92D298c512478CaD67e8',
  CREAM: '0xd4CB328A82bDf5f03eB737f37Fa6B370aef3e888',
  DAI: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
  DEGO: '0x3FdA9383A84C05eC8f7630Fe10AdF1fAC13241CC',
  DODO: '0x67ee3Cb086F8a16f34beE3ca72FAD36F7Db929e2',
  DOGE: '0xbA2aE424d960c26247Dd6c32edC70B295c744C43',
  DOT: '0x7083609fCE4d1d8Dc0C979AAb8c869Ea2C873402',
  EOS: '0x56b6fB708fC5732DEC1Afc8D8556423A2EDcCbD6',
  ETH: '0x2170Ed0880ac9A755fd29B2688956BD959F933F8',
  FIL: '0x0D8Ce2A99Bb6e3B7Db580eD848240e4a0F9aE153',
  // FNDZ: '0x7754c0584372D29510C019136220f91e25a8f706',
  INJ: '0xa2B726B1145A4773F68593CF171187d8EBe4d495',
  LINA: '0x762539b45A1dCcE3D36d080F74d1AED37844b878',
  LINK: '0xF8A0BF9cF54Bb92F17374d9e9A321E6a111a51bD',
  LIT: '0xb59490aB09A0f526Cc7305822aC65f2Ab12f9723',
  LTC: '0x4338665CBB7B2485A8855A139b75D5e34AB0DB94',
  MASK: '0x2eD9a5C8C13b93955103B9a7C167B67Ef4d568a3',
  MIR: '0x5B6DcF557E2aBE2323c48445E8CC948910d8c2c9',
  NULS: '0x8CD6e29d3686d24d3C2018CEe54621eA0f89313B',
  ONT: '0xFd7B3A77848f1C2D67E05E54d78d174a0C850335',
  RAMP: '0x8519EA49c997f50cefFa444d240fB655e89248Aa',
  REEF: '0xF21768cCBC73Ea5B6fd3C687208a7c2def2d966e',
  SUSHI: '0x947950BcC74888a40Ffa2593C5798F11Fc9124C4',
  SXP: '0x47BEAd2563dCBf3bF2c9407fEa4dC236fAbA485A',
  TRX: '0x85EAC5Ac2F758618dFa09bDbe0cf174e7d574D5B',
  TWT: '0x4B0F1812e5Df2A09796481Ff14017e6005508003',
  UNI: '0xBf5140A22578168FD562DCcF235E5D43A02ce9B1',
  USDC: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
  USDT: '0x55d398326f99059fF775485246999027B3197955',
  WOO: '0x4691937a7508860F876c9c0a2a617E7d9E945D4B',
  XRP: '0x1D2F0da169ceB9fC7B3144628dB156f3F6c60dBE',
  XTZ: '0x16939ef78684453bfDFb47825F8a5F714f12623a',
  XVS: '0xcF6BB5389c92Bdda8a3747Ddb454cB7a64626C63',
  YFI: '0x88f1A5ae2A3BF98AEAF342D26B30a79438c9142e',
  YFII: '0x7F70642d88cf1C4a3a7abb072B53B929b653edA5',
  ZIL: '0xb86AbCb37C3A4B64f74f59301AFF131a1BEcC787',
};

// Aggregators for Chain Link Price Feeds of Assets
// rateAsset 0 -> ETH, 1 -> USD
const primitvePriceFeedAggregators = {
  ADA: {
    rateAsset: 1,
    address: '0xa767f745331D267c7751297D982b050c93985627',
  },
  ALPACA: {
    rateAsset: 1,
    address: '0xe0073b60833249ffd1bb2af809112c2fbf221DF6',
  },
  ALPHA: {
    rateAsset: 0,
    address: '0x7bC032A7C19B1BdCb981D892854d090cfB0f238E',
  },
  ARPA: {
    rateAsset: 1,
    address: '0x31E0110f8c1376a699C8e3E65b5110e0525A811d',
  },
  ATOM: {
    rateAsset: 1,
    address: '0xb056B7C804297279A9a673289264c17E6Dc6055d',
  },
  AXS: {
    rateAsset: 1,
    address: '0x7B49524ee5740c99435f52d731dFC94082fE61Ab',
  },
  BAND: {
    rateAsset: 1,
    address: '0xC78b99Ae87fF43535b0C782128DB3cB49c74A4d3',
  },
  BCH: {
    rateAsset: 1,
    address: '0x43d80f616DAf0b0B42a928EeD32147dC59027D41',
  },
  BETH: {
    rateAsset: 1,
    address: '0x2A3796273d47c4eD363b361D3AEFb7F7E2A13782',
  },
  BIFI: {
    rateAsset: 1,
    address: '0xaB827b69daCd586A37E80A7d552a4395d576e645',
  },
  BTCB: {
    rateAsset: 1,
    address: '0x264990fbd0A4796A3E3d8E37C4d5F87a3aCa5Ebf',
  },
  BUSD: {
    rateAsset: 1,
    address: '0xcBb98864Ef56E9042e7d2efef76141f15731B82f',
  },
  CAKE: {
    rateAsset: 1,
    address: '0xB6064eD41d4f67e353768aA239cA86f4F73665a1',
  },
  CHR: {
    rateAsset: 1,
    address: '0x1f771B2b1F3c3Db6C7A1d5F38961a49CEcD116dA',
  },
  COMP: {
    rateAsset: 1,
    address: '0x0Db8945f9aEf5651fa5bd52314C5aAe78DfDe540',
  },
  CREAM: {
    rateAsset: 1,
    address: '0xa12Fc27A873cf114e6D8bBAf8BD9b8AC56110b39',
  },
  DAI: {
    rateAsset: 1,
    address: '0x132d3C0B1D2cEa0BC552588063bdBb210FDeecfA',
  },
  DEGO: {
    rateAsset: 1,
    address: '0x39F1275366D130eB677D4F47D40F9296B62D877A',
  },
  DODO: {
    rateAsset: 1,
    address: '0x87701B15C08687341c2a847ca44eCfBc8d7873E1',
  },
  DOGE: {
    rateAsset: 1,
    address: '0x3AB0A0d137D4F946fBB19eecc6e92E64660231C8',
  },
  DOT: {
    rateAsset: 1,
    address: '0xC333eb0086309a16aa7c8308DfD32c8BBA0a2592',
  },
  EOS: {
    rateAsset: 1,
    address: '0xd5508c8Ffdb8F15cE336e629fD4ca9AdB48f50F0',
  },
  ETH: {
    rateAsset: 1,
    address: '0x9ef1B8c0E4F7dc8bF5719Ea496883DC6401d5b2e',
  },
  FIL: {
    rateAsset: 1,
    address: '0xE5dbFD9003bFf9dF5feB2f4F445Ca00fb121fb83',
  },
  // FNDZ: {
  //   rateAsset: 1,
  //   address: '0x0000000000000000000000000000000000000000',
  // },
  INJ: {
    rateAsset: 1,
    address: '0x63A9133cd7c611d6049761038C16f238FddA71d7',
  },
  LINA: {
    rateAsset: 1,
    address: '0x38393201952f2764E04B290af9df427217D56B41',
  },
  LINK: {
    rateAsset: 1,
    address: '0xca236E327F629f9Fc2c30A4E95775EbF0B89fac8',
  },
  LIT: {
    rateAsset: 1,
    address: '0x83766bA8d964fEAeD3819b145a69c947Df9Cb035',
  },
  LTC: {
    rateAsset: 1,
    address: '0x74E72F37A8c415c8f1a98Ed42E78Ff997435791D',
  },
  MASK: {
    rateAsset: 1,
    address: '0x4978c0abE6899178c1A74838Ee0062280888E2Cf',
  },
  MIR: {
    rateAsset: 1,
    address: '0x291B2983b995870779C36A102Da101f8765244D6',
  },
  NULS: {
    rateAsset: 1,
    address: '0xaCFBE73231d312AC6954496b3f786E892bF0f7e5',
  },
  ONT: {
    rateAsset: 1,
    address: '0x887f177CBED2cf555a64e7bF125E1825EB69dB82',
  },
  RAMP: {
    rateAsset: 1,
    address: '0xD1225da5FC21d17CaE526ee4b6464787c6A71b4C',
  },
  REEF: {
    rateAsset: 1,
    address: '0x46f13472A4d4FeC9E07E8A00eE52f4Fa77810736',
  },
  SUSHI: {
    rateAsset: 1,
    address: '0xa679C72a97B654CFfF58aB704de3BA15Cde89B07',
  },
  SXP: {
    rateAsset: 1,
    address: '0xE188A9875af525d25334d75F3327863B2b8cd0F1',
  },
  TRX: {
    rateAsset: 1,
    address: '0xF4C5e535756D11994fCBB12Ba8adD0192D9b88be',
  },
  TWT: {
    rateAsset: 0,
    address: '0x7E728dFA6bCa9023d9aBeE759fDF56BEAb8aC7aD',
  },
  UNI: {
    rateAsset: 1,
    address: '0xb57f259E7C24e56a1dA00F66b55A5640d9f9E7e4',
  },
  USDC: {
    rateAsset: 1,
    address: '0x51597f405303C4377E36123cBc172b13269EA163',
  },
  USDT: {
    rateAsset: 1,
    address: '0xB97Ad0E74fa7d920791E90258A6E2085088b4320',
  },
  WOO: {
    rateAsset: 1,
    address: '0x02Bfe714e78E2Ad1bb1C2beE93eC8dc5423B66d4',
  },
  XRP: {
    rateAsset: 1,
    address: '0x93A67D414896A280bF8FFB3b389fE3686E014fda',
  },
  XTZ: {
    rateAsset: 1,
    address: '0x9A18137ADCF7b05f033ad26968Ed5a9cf0Bf8E6b',
  },
  XVS: {
    rateAsset: 1,
    address: '0xBF63F430A79D4036A5900C19818aFf1fa710f206',
  },
  YFI: {
    rateAsset: 1,
    address: '0xD7eAa5Bf3013A96e3d515c055Dbd98DbdC8c620D',
  },
  YFII: {
    rateAsset: 1,
    address: '0xC94580FAaF145B2FD0ab5215031833c98D3B77E4',
  },
  ZIL: {
    rateAsset: 1,
    address: '0x3e3aA4FC329529C8Ab921c810850626021dbA7e6',
  },
};

const doSleep = false;
const sleepTime = 3000;

function sleep(ms) {
  console.log(`\nSleeping for ${ms}ms...\n`);
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // Hardhat always runs the compile task when running scripts with its command
  // line interface.
  //
  // If this script is run directly using `node` you may want to call compile
  // manually to make sure everything is compiled
  // await hre.run('compile');

  const accounts = await hre.ethers.getSigners();
  const deployer = accounts[0];

  const fndzController = await hre.mbDeployer.deployProxy(
    deployer,
    'FNDZController',
    [
      dependencies.fndzToken,
      dependencies.uniswapV2Router02,
      dependencies.uniswapV2Factory,
      dependencies.fndzDao,
      tokens.BUSD, // Confirmed to use BUSD from FNDZ
    ],
    {
      addressLabel: 'fndz_controller',
      contractLabel: 'fndz_controller',
    },
  );

  console.log(`Deployed FNDZController.sol to ${fndzController.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const fndzControllerAddDenominationAssetsTx = await fndzController.contract.addDenominationAssets([
    tokens.BUSD,
    tokens.DAI,
    tokens.USDC,
    tokens.USDT,
  ]);
  console.log(`✅ fndzControllerAddDenominationAssetsTx: ${fndzControllerAddDenominationAssetsTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const referralRegistry = await hre.mbDeployer.deployProxy(deployer, 'ReferralRegistry', [], {
    addressLabel: 'referral_registry',
    contractLabel: 'referral_registry',
  });

  console.log(`Deployed ReferralRegistry.sol to ${referralRegistry.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const fndzInvestmentRegistry = await hre.mbDeployer.deployProxy(
    deployer,
    'FNDZInvestmentRegistry',
    [dependencies.fndzToken],
    {
      addressLabel: 'fndz_investment_registry',
      contractLabel: 'fndz_investment_registry',
    },
  );

  console.log(`Deployed FNDZInvestmentRegistry.sol to ${fndzInvestmentRegistry.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const dispatcher = await hre.mbDeployer.deploy(deployer, 'Dispatcher', [], {
    addressLabel: 'dispatcher',
    contractLabel: 'dispatcher',
  });

  console.log(`Deployed Dispatcher.sol to ${dispatcher.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const fundDeployer = await hre.mbDeployer.deploy(
    deployer,
    'FundDeployer',
    [
      dispatcher.mbAddress.address,
      fndzController.mbAddress.address,
      [], // address[] memory _vaultCallContracts TODO MockSynthetixIntegratee
      [], // bytes4[] memory _vaultCallSelectors TODO
    ],
    {
      addressLabel: 'fund_deployer',
      contractLabel: 'fund_deployer',
    },
  );

  console.log(`Deployed FundDeployer.sol to ${fundDeployer.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const fndzControllerUpdateFundDeployerTx = await fndzController.contract.updateFundDeployerAddress(
    fundDeployer.mbAddress.address,
  );
  console.log(`✅ fndzControllerUpdateFundDeployerTx: ${fndzControllerUpdateFundDeployerTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  // Listing out primitives and Aggregators
  var primitiveTokens = [];
  var aggregators = [];
  var rateAssets = [];
  for (var symbol in tokens) {
    primitiveTokens.push(tokens[symbol]);
    aggregators.push(primitvePriceFeedAggregators[symbol].address);
    rateAssets.push(primitvePriceFeedAggregators[symbol].rateAsset);
  }

  const chainlinkPriceFeed = await hre.mbDeployer.deploy(
    deployer,
    'ChainlinkPriceFeed',
    [
      fndzController.mbAddress.address, // address _fndzController,
      dependencies.WBNBToken, // address _wethToken,
      dependencies.WBNBUSDAggregator, // address _ethUsdAggregator, EACAggregatorProxy
      primitiveTokens, // address[] memory _primitives,
      aggregators, // address[] memory _aggregators,
      rateAssets, // RateAsset[] memory _rateAssets
    ],
    {
      addressLabel: 'chainlink_price_feed',
      contractLabel: 'chainlink_price_feed',
    },
  );

  console.log(`Deployed ChainlinkPriceFeed.sol to ${chainlinkPriceFeed.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const setStaleRateThresholdTx = await chainlinkPriceFeed.contract.setStaleRateThreshold(31536000);
  console.log(`✅ setStaleRateThresholdTx: ${setStaleRateThresholdTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  // @dev - Derivative Tokens and Derivative price feeds can be added in Future
  const aggregatedDerivativePriceFeed = await hre.mbDeployer.deploy(
    deployer,
    'AggregatedDerivativePriceFeed',
    [
      fundDeployer.mbAddress.address, // address _fundDeployer,
      [], // address[] memory _derivatives,
      [], // address[] memory _priceFeeds
    ],
    {
      addressLabel: 'aggregated_derivative_price_feed',
      contractLabel: 'aggregated_derivative_price_feed',
    },
  );

  console.log(`Deployed AggregatedDerivativePriceFeed.sol to ${aggregatedDerivativePriceFeed.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const fndzStaking = await hre.mbDeployer.deploy(deployer, 'FNDZStaking', [fndzController.mbAddress.address], {
    addressLabel: 'fndz_staking',
    contractLabel: 'fndz_staking',
  });

  console.log(`Deployed FNDZStaking.sol to ${fndzStaking.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const fndzControllerUpdateFndzStakingPoolAddressTx = await fndzController.contract.updateFndzStakingPoolAddress(
    fndzStaking.mbAddress.address,
  );
  console.log(`✅ fndzControllerUpdateFndzStakingPoolAddressTx: ${fndzControllerUpdateFndzStakingPoolAddressTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const fndzStakingAddTrackedAssetsTx = await fndzStaking.contract.addTrackedAssets(primitiveTokens);
  console.log(`✅ fndzStakingAddTrackedAssetsTx: ${fndzStakingAddTrackedAssetsTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const valueInterpreter = await hre.mbDeployer.deploy(
    deployer,
    'ValueInterpreter',
    [
      chainlinkPriceFeed.mbAddress.address, // address _primitivePriceFeed
      aggregatedDerivativePriceFeed.mbAddress.address, // address _aggregatedDerivativePriceFeed
    ],
    {
      addressLabel: 'value_interpreter',
      contractLabel: 'value_interpreter',
    },
  );

  console.log(`Deployed ValueInterpreter.sol to ${valueInterpreter.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const feeManager = await hre.mbDeployer.deploy(
    deployer,
    'FeeManager',
    [
      fundDeployer.mbAddress.address, // address _fundDeployer
      fndzController.mbAddress.address,
      referralRegistry.mbAddress.address,
    ],
    {
      addressLabel: 'fee_manager',
      contractLabel: 'fee_manager',
    },
  );

  console.log(`Deployed FeeManager.sol to ${feeManager.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const policyManager = await hre.mbDeployer.deploy(
    deployer,
    'PolicyManager',
    [
      fundDeployer.mbAddress.address, // address _fundDeployer
    ],
    {
      addressLabel: 'policy_manager',
      contractLabel: 'policy_manager',
    },
  );

  console.log(`Deployed PolicyManager.sol to ${policyManager.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const integrationManager = await hre.mbDeployer.deploy(
    deployer,
    'IntegrationManager',
    [
      fundDeployer.mbAddress.address, // address _fundDeployer,
      policyManager.mbAddress.address, // address _policyManager,
      aggregatedDerivativePriceFeed.mbAddress.address, // address _derivativePriceFeed,
      chainlinkPriceFeed.mbAddress.address, // address _primitivePriceFeed
      fndzInvestmentRegistry.mbAddress.address,
    ],
    {
      addressLabel: 'integration_manager',
      contractLabel: 'integration_manager',
    },
  );

  console.log(`Deployed IntegrationManager.sol to ${integrationManager.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const vaultLib = await hre.mbDeployer.deploy(deployer, 'VaultLib', [], {
    addressLabel: 'vault_lib',
    contractLabel: 'vault_lib',
  });

  console.log(`Deployed VaultLib.sol to ${vaultLib.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const setVaultLibTx = await fundDeployer.contract.setVaultLib(vaultLib.mbAddress.address);
  console.log(`✅ setVaultLibTx: ${setVaultLibTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const comptrollerLib = await hre.mbDeployer.deploy(
    deployer,
    'ComptrollerLib',
    [
      dispatcher.mbAddress.address, // address _dispatcher,
      fundDeployer.mbAddress.address, // address _fundDeployer,
      valueInterpreter.mbAddress.address, // address _valueInterpreter,
      feeManager.mbAddress.address, // address _feeManager,
      integrationManager.mbAddress.address, // address _integrationManager,
      policyManager.mbAddress.address, // address _policyManager,
      chainlinkPriceFeed.mbAddress.address, // address _primitivePriceFeed,
    ],
    {
      addressLabel: 'comptroller_lib',
      contractLabel: 'comptroller_lib',
    },
  );

  console.log(`Deployed ComptrollerLib.sol to ${comptrollerLib.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const setComptrollerLibTx = await fundDeployer.contract.setComptrollerLib(comptrollerLib.mbAddress.address);
  console.log(`✅ setComptrollerLibTx: ${setComptrollerLibTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  // PARASWAP
  const paraSwapV5Adapter = await hre.mbDeployer.deploy(
    deployer,
    'ParaSwapV5Adapter',
    [
      integrationManager.mbAddress.address, // address _integrationManager,
      dependencies.augustusSwapper, // address _augustusSwapper,
      dependencies.tokenTransferProxy, // address _tokenTransferProxy
    ],
    {
      addressLabel: 'para_swap_v5_adapter',
      contractLabel: 'para_swap_v5_adapter',
    },
  );

  console.log(`Deployed ParaSwapV5Adapter.sol to ${paraSwapV5Adapter.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const managementFee = await hre.mbDeployer.deploy(
    deployer,
    'ManagementFee',
    [
      feeManager.mbAddress.address, // address _feeManager,
    ],
    {
      addressLabel: 'management_fee',
      contractLabel: 'management_fee',
    },
  );

  console.log(`Deployed ManagementFee.sol to ${managementFee.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const performanceFee = await hre.mbDeployer.deploy(
    deployer,
    'PerformanceFee',
    [
      feeManager.mbAddress.address, // address _feeManager,
    ],
    {
      addressLabel: 'performance_fee',
      contractLabel: 'performance_fee',
    },
  );

  console.log(`Deployed PerformanceFee.sol to ${performanceFee.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const entranceReferralFee = await hre.mbDeployer.deploy(
    deployer,
    'EntranceReferralFee',
    [feeManager.mbAddress.address, referralRegistry.mbAddress.address],
    {
      addressLabel: 'entrance_referral_fee',
      contractLabel: 'entrance_referral_fee',
    },
  );

  console.log(`Deployed EntranceReferralFee.sol to ${entranceReferralFee.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const setEntranceReferralFeeAddressTx = await referralRegistry.contract.setFeeAddress(
    entranceReferralFee.mbAddress.address,
  );
  console.log(`✅ setEntranceReferralFeeAddressTx: ${setEntranceReferralFeeAddressTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const fndzInvestmentFee = await hre.mbDeployer.deploy(
    deployer,
    'FNDZInvestmentFee',
    [feeManager.mbAddress.address, dependencies.fndzToken, fndzInvestmentRegistry.mbAddress.address],
    {
      addressLabel: 'fndz_investment_fee',
      contractLabel: 'fndz_investment_fee',
    },
  );

  console.log(`Deployed FNDZInvestmentFee.sol to ${fndzInvestmentFee.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const setFNDZInvesFeeAddressTx = await fndzInvestmentRegistry.contract.setFeeAddress(
    fndzInvestmentFee.mbAddress.address,
  );
  console.log(`✅ setFNDZInvesFeeAddressTx: ${setFNDZInvesFeeAddressTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const investorWhitelist = await hre.mbDeployer.deploy(
    deployer,
    'InvestorWhitelist',
    [
      policyManager.mbAddress.address, // address _policyManager,
    ],
    {
      addressLabel: 'investor_whitelist',
      contractLabel: 'investor_whitelist',
    },
  );

  console.log(`Deployed InvestorWhitelist.sol to ${investorWhitelist.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const minMaxInvestment = await hre.mbDeployer.deploy(
    deployer,
    'MinMaxInvestment',
    [
      policyManager.mbAddress.address, // address _policyManager,
    ],
    {
      addressLabel: 'min_max_investment',
      contractLabel: 'min_max_investment',
    },
  );

  console.log(`Deployed MinMaxInvestment.sol to ${minMaxInvestment.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const fundActionsWrapper = await hre.mbDeployer.deploy(
    deployer,
    'FundActionsWrapper',
    [
      feeManager.mbAddress.address, // address _feeManager
    ],
    {
      addressLabel: 'fund_actions_wrapper',
      contractLabel: 'fund_actions_wrapper',
    },
  );

  console.log(`Deployed FundActionsWrapper.sol to ${fundActionsWrapper.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const chainlinkPriceAggregator = await hre.mbDeployer.deployProxy(
    deployer,
    'ChainlinkPriceAggregator',
    [dependencies.chainlinkOracle],
    {
      addressLabel: 'chainlink_price_aggregator',
      contractLabel: 'chainlink_price_aggregator',
    },
  );

  console.log(`Deployed ChainlinkPriceAggregator.sol to ${chainlinkPriceAggregator.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const fndzPriceAggregatorProxy = await hre.mbDeployer.deploy(
    deployer,
    'PriceAggregatorProxy',
    [chainlinkPriceAggregator.mbAddress.address, dependencies.fndzToken, 'FNDZ / USD', 8],
    {
      addressLabel: 'fndz_price_aggregator_proxy',
      contractLabel: 'price_aggregator_proxy',
    },
  );

  console.log(`Deployed PriceAggregatorProxy.sol to ${fndzPriceAggregatorProxy.mbAddress.address}`);

  if (doSleep) await sleep(sleepTime);

  const registerAdaptersTx = await integrationManager.contract.registerAdapters([paraSwapV5Adapter.mbAddress.address]);

  console.log(`✅ registerAdaptersTx: ${registerAdaptersTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const registerFeesTx = await feeManager.contract.registerFees([
    managementFee.mbAddress.address,
    performanceFee.mbAddress.address,
    entranceReferralFee.mbAddress.address,
    fndzInvestmentFee.mbAddress.address,
  ]);

  console.log(`✅ registerFeesTx: ${registerFeesTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const fndzControllerSetManagementFeeConfigurationTx = await fndzController.contract.setFeeConfiguration(
    managementFee.mbAddress.address,
    [0], // minimum of 0%
    [hre.ethers.BigNumber.from('1000000000965855133796871400')], // maximum of 3% (formatted as scaledPerSecondRate)
  );
  console.log(
    `✅ fndzControllerSetManagementFeeConfigurationTx: ${fndzControllerSetManagementFeeConfigurationTx.hash}`,
  );

  if (doSleep) await sleep(sleepTime);

  const fndzControllerSetPerformanceFeeConfigurationTx = await fndzController.contract.setFeeConfiguration(
    performanceFee.mbAddress.address,
    [0, hre.ethers.BigNumber.from('604800')], // minimum of 0%, minimum crystallization period is one week
    [hre.ethers.utils.parseEther('0.3'), hre.ethers.BigNumber.from('7884000')], // maximum of 30%, maximum crystallization period is quarterly (91.25 days)
  );
  console.log(
    `✅ fndzControllerSetPerformanceFeeConfigurationTx: ${fndzControllerSetPerformanceFeeConfigurationTx.hash}`,
  );

  if (doSleep) await sleep(sleepTime);

  const fndzControllerSetEntranceReferralFeeConfigurationTx = await fndzController.contract.setFeeConfiguration(
    entranceReferralFee.mbAddress.address,
    [hre.ethers.utils.parseEther('0.005')], // minimum of 0.5%
    [hre.ethers.utils.parseEther('0.01')], // maximum of 1%
  );
  console.log(
    `✅ fndzControllerSetEntranceReferralFeeConfigurationTx: ${fndzControllerSetEntranceReferralFeeConfigurationTx.hash}`,
  );

  if (doSleep) await sleep(sleepTime);

  const fndzControllerSetFndzInvestmentFeeConfigurationTx = await fndzController.contract.setFeeConfiguration(
    fndzInvestmentFee.mbAddress.address,
    [hre.ethers.utils.parseEther('0.01')], // minimum of 1%
    [hre.ethers.utils.parseEther('0.02')], // maximum of 2%
  );
  console.log(
    `✅ fndzControllerSetFndzInvestmentFeeConfigurationTx: ${fndzControllerSetFndzInvestmentFeeConfigurationTx.hash}`,
  );

  if (doSleep) await sleep(sleepTime);

  const registerPoliciesTx = await policyManager.contract.registerPolicies([
    investorWhitelist.mbAddress.address,
    minMaxInvestment.mbAddress.address,
  ]);

  console.log(`✅ registerPoliciesTx: ${registerPoliciesTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const setReleaseStatusTx = await fundDeployer.contract.setReleaseStatus(1);

  console.log(`✅ setReleaseStatusTx: ${setReleaseStatusTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const setCurrentFundDeployerTx = await dispatcher.contract.setCurrentFundDeployer(fundDeployer.mbAddress.address);

  console.log(`✅ setCurrentFundDeployerTx: ${setCurrentFundDeployerTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const setMigrationTimelockTx = await dispatcher.contract.setMigrationTimelock(0);

  console.log(`✅ setMigrationTimelockTx: ${setMigrationTimelockTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  // Transferring Ownerships
  const fndzControllerTransferOwnershipTx = await fndzController.contract.transferOwnership(dependencies.fndzOwner);

  console.log(`✅ fndzControllerTransferOwnershipTx: ${fndzControllerTransferOwnershipTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const referralRegistryTransferOwnershipTx = await referralRegistry.contract.transferOwnership(dependencies.fndzOwner);

  console.log(`✅ referralRegistryTransferOwnershipTx: ${referralRegistryTransferOwnershipTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  const fndzInvestmentRegistryTransferOwnershipTx = await fndzInvestmentRegistry.contract.transferOwnership(
    dependencies.fndzOwner,
  );

  console.log(`✅ fndzInvestmentRegistryTransferOwnershipTx: ${fndzInvestmentRegistryTransferOwnershipTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  // For the dispatcher fndz Owner needs to claim the ownership after nominated
  const dispatcherSetNominatedOwnerTx = await dispatcher.contract.setNominatedOwner(dependencies.fndzOwner);

  console.log(`✅ dispatcherSetNominatedOwnerTx: ${dispatcherSetNominatedOwnerTx.hash}`);

  if (doSleep) await sleep(sleepTime);

  await verifyContract(fndzController.implementationAddress, []);

  console.log(`Verified FNDZController.sol on ${fndzController.implementationAddress}`);

  await verifyContract(referralRegistry.implementationAddress, []);

  console.log(`Verified ReferralRegistry.sol on ${referralRegistry.implementationAddress}`);

  await verifyContract(fndzInvestmentRegistry.implementationAddress, []);

  console.log(`Verified FNDZInvestmentRegistry.sol on ${fndzInvestmentRegistry.implementationAddress}`);

  await verifyContract(dispatcher.mbAddress.address, []);

  console.log(`Verified Dispatcher.sol on ${dispatcher.mbAddress.address}`);

  await verifyContract(fundDeployer.mbAddress.address, [
    dispatcher.mbAddress.address,
    fndzController.mbAddress.address,
    [], // address[] memory _vaultCallContracts TODO MockSynthetixIntegratee
    [], // bytes4[] memory _vaultCallSelectors TODO
  ]);

  console.log(`Verified FundDeployer.sol on ${fundDeployer.mbAddress.address}`);

  await verifyContract(chainlinkPriceFeed.mbAddress.address, [
    fndzController.mbAddress.address, // address _fndzController,
    dependencies.WBNBToken, // address _wethToken,
    dependencies.WBNBUSDAggregator, // address _ethUsdAggregator, EACAggregatorProxy
    primitiveTokens, // address[] memory _primitives,
    aggregators, // address[] memory _aggregators,
    rateAssets, // RateAsset[] memory _rateAssets
  ]);

  console.log(`Verified ChainlinkPriceFeed.sol on ${chainlinkPriceFeed.mbAddress.address}`);

  await verifyContract(aggregatedDerivativePriceFeed.mbAddress.address, [
    fundDeployer.mbAddress.address, // address _fundDeployer,
    [], // address[] memory _derivatives,
    [], // address[] memory _priceFeeds
  ]);

  console.log(`Verified AggregatedDerivativePriceFeed.sol on ${aggregatedDerivativePriceFeed.mbAddress.address}`);

  await verifyContract(fndzStaking.mbAddress.address, [fndzController.mbAddress.address]);

  console.log(`Verified FNDZStaking.sol on ${fndzStaking.mbAddress.address}`);

  await verifyContract(valueInterpreter.mbAddress.address, [
    chainlinkPriceFeed.mbAddress.address, // address _primitivePriceFeed
    aggregatedDerivativePriceFeed.mbAddress.address, // address _aggregatedDerivativePriceFeed
  ]);

  console.log(`Verified ValueInterpreter.sol on ${valueInterpreter.mbAddress.address}`);

  await verifyContract(feeManager.mbAddress.address, [
    fundDeployer.mbAddress.address, // address _fundDeployer
    fndzController.mbAddress.address,
    referralRegistry.mbAddress.address,
  ]);

  console.log(`Verified FeeManager.sol on ${feeManager.mbAddress.address}`);

  await verifyContract(policyManager.mbAddress.address, [
    fundDeployer.mbAddress.address, // address _fundDeployer
  ]);

  console.log(`Verified PolicyManager.sol on ${policyManager.mbAddress.address}`);

  await verifyContract(integrationManager.mbAddress.address, [
    fundDeployer.mbAddress.address, // address _fundDeployer,
    policyManager.mbAddress.address, // address _policyManager,
    aggregatedDerivativePriceFeed.mbAddress.address, // address _derivativePriceFeed,
    chainlinkPriceFeed.mbAddress.address, // address _primitivePriceFeed
    fndzInvestmentRegistry.mbAddress.address,
  ]);

  console.log(`Verified IntegrationManager.sol on ${integrationManager.mbAddress.address}`);

  await verifyContract(vaultLib.mbAddress.address, []);

  console.log(`Verified VaultLib.sol on ${vaultLib.mbAddress.address}`);

  await verifyContract(comptrollerLib.mbAddress.address, [
    dispatcher.mbAddress.address, // address _dispatcher,
    fundDeployer.mbAddress.address, // address _fundDeployer,
    valueInterpreter.mbAddress.address, // address _valueInterpreter,
    feeManager.mbAddress.address, // address _feeManager,
    integrationManager.mbAddress.address, // address _integrationManager,
    policyManager.mbAddress.address, // address _policyManager,
    chainlinkPriceFeed.mbAddress.address, // address _primitivePriceFeed,
  ]);

  console.log(`Verified ComptrollerLib.sol on ${comptrollerLib.mbAddress.address}`);

  await verifyContract(paraSwapV5Adapter.mbAddress.address, [
    integrationManager.mbAddress.address, // address _integrationManager,
    dependencies.augustusSwapper, // address _augustusSwapper,
    dependencies.tokenTransferProxy, // address _tokenTransferProxy
  ]);

  console.log(`Verified ParaSwapV5Adapter.sol on ${paraSwapV5Adapter.mbAddress.address}`);

  await verifyContract(managementFee.mbAddress.address, [
    feeManager.mbAddress.address, // address _feeManager,
  ]);

  console.log(`Verified ManagementFee.sol on ${managementFee.mbAddress.address}`);

  await verifyContract(performanceFee.mbAddress.address, [
    feeManager.mbAddress.address, // address _feeManager,
  ]);

  console.log(`Verified PerformanceFee.sol on ${performanceFee.mbAddress.address}`);

  await verifyContract(entranceReferralFee.mbAddress.address, [
    feeManager.mbAddress.address,
    referralRegistry.mbAddress.address,
  ]);

  console.log(`Verified EntranceReferralFee.sol on ${entranceReferralFee.mbAddress.address}`);

  await verifyContract(fndzInvestmentFee.mbAddress.address, [
    feeManager.mbAddress.address,
    dependencies.fndzToken,
    fndzInvestmentRegistry.mbAddress.address,
  ]);

  console.log(`Verified FNDZInvestmentFee.sol on ${fndzInvestmentFee.mbAddress.address}`);

  await verifyContract(investorWhitelist.mbAddress.address, [
    policyManager.mbAddress.address, // address _policyManager,
  ]);

  console.log(`Verified InvestorWhitelist.sol on ${investorWhitelist.mbAddress.address}`);

  await verifyContract(minMaxInvestment.mbAddress.address, [
    policyManager.mbAddress.address, // address _policyManager,
  ]);

  console.log(`Verified MinMaxInvestment.sol on ${minMaxInvestment.mbAddress.address}`);

  await verifyContract(fundActionsWrapper.mbAddress.address, [
    feeManager.mbAddress.address, // address _feeManager
  ]);

  console.log(`Verified FundActionsWrapper.sol on ${fundActionsWrapper.mbAddress.address}`);

  await verifyContract(chainlinkPriceAggregator.mbAddress.address, [dependencies.chainlinkOracle]);

  console.log(`Verified ChainlinkPriceAggregator.sol on ${chainlinkPriceAggregator.mbAddress.address}`);

  await verifyContract(fndzPriceAggregatorProxy.mbAddress.address, [
    chainlinkPriceAggregator.mbAddress.address,
    dependencies.fndzToken,
    'FNDZ / USD',
    8,
  ]);

  console.log(`Verified PriceAggregatorProxy.sol for FNDZ/USD on ${fndzPriceAggregatorProxy.mbAddress.address}`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
