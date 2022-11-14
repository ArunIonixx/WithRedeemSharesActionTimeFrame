/* eslint-disable @typescript-eslint/no-var-requires */
const { utils, BigNumber } = require('ethers');
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { deployments } = require('./utils/deploy-test-contracts.js');
const { filterEventsByABI, advanceTime, transferABI } = require('./utils/fndz-utilities.js');
/* eslint-enable @typescript-eslint/no-var-requires */

let accounts;
let deployer;
let abiCoder;
let fndzStaking;
let contracts;
let fndzToken;
let busdToken;
let daiToken;
let wbtcToken;
let usdcToken;
let fndzController;

const AddressZero = ethers.constants.AddressZero;
const fndzStakedEventABI = 'event FNDZStaked(address indexed stakeholder, uint256 stakedAmount)';
const earnedFNDZUpdatedEventABI =
  'event EarnedRewardsUpdated(address stakeholder,address[] earnedAssets,uint256[] earnedAmounts)';
const unstakeEventABI = 'event FNDZUnstaked(address indexed stakeholder, uint256 unstakedAmount)';
const fndzWithdrawnEventABI =
  'event FNDZWithdrawn(address indexed stakeholder, uint256 unstakedAmount, uint256 withdrawnAmount)';
const withdrawFeeSettledEventABI =
  'event WithdrawFeeSettled(address payer, address payee, uint256 unstakeAmount, uint256 feeAmount)';
const rewardsClaimedAsFNDZEventABI = 'event RewardsClaimedAsFNDZ(address stakeholder,uint256 claimedFNDZ)';
const rewardsClaimedAsTrackedAssetsEventABI =
  'event RewardsClaimedAsTrackedAssets(address stakeholder,address[] rewardedAssets,uint256[] rewardedAmounts)';
const assetSwappedEventABI =
  'event AssetSwappedAndTransferred(address indexed sourceAsset,address indexed destinationAsset,address indexed target,uint256 sourceAmount,uint256 destinationAmount)';
const addedTrackedAssetsEventABI = 'event TrackedAssetAdded(address asset)';
const removedTrackedAssetsEventABI = 'event TrackedAssetRemoved(address asset)';
const unstakeFeeRateUpdatedEventABI = 'event UnstakeFeeRateUpdated(uint256 _oldFeeRate, uint256 _newFeeRate)';
const unstakeTimelockUpdatedEventABI = 'event UnstakeTimelockUpdated(uint256 _oldTimelock, uint256 _newTimelock)';

beforeEach(async function () {
  // runs before each test in this block
  contracts = await deployments();
  accounts = await ethers.getSigners();
  deployer = accounts[0];
  abiCoder = new utils.AbiCoder();
  const FNDZStaking = await ethers.getContractFactory('FNDZStaking', deployer);
  fndzStaking = FNDZStaking.attach(contracts.FNDZStaking);
  expect(fndzStaking).to.be.an('object');

  const FNDZController = await ethers.getContractFactory('FNDZController', deployer);
  fndzController = FNDZController.attach(contracts.FNDZController);
  expect(fndzController).to.be.an('object');

  const MockToken = await ethers.getContractFactory('MockToken', deployer);
  fndzToken = MockToken.attach(contracts.mockTokens.MockFNDZ);
  busdToken = MockToken.attach(contracts.mockTokens.MockBUSD);
  daiToken = MockToken.attach(contracts.mockTokens.MockDai);
  usdcToken = MockToken.attach(contracts.mockTokens.MockUSDC);
  wbtcToken = MockToken.attach(contracts.mockTokens.MockWBTC);

  // Adding balance to the users
  await fndzToken.mintFor(accounts[1].address, utils.parseEther('10000'));
  await fndzToken.mintFor(accounts[2].address, utils.parseEther('10000'));
  await fndzToken.mintFor(accounts[3].address, utils.parseEther('10000'));
  await fndzToken.mintFor(accounts[4].address, utils.parseEther('10000'));
  await fndzToken.mintFor(accounts[5].address, utils.parseEther('10000'));

  // Updating the tracked assets
  await fndzStaking.addTrackedAssets([busdToken.address]);

  // Adding rewards to the Pool
  await busdToken.mintFor(fndzStaking.address, utils.parseEther('1000'));

  // Uniswap pair creation and registering
  // BUSD to FNDZ Pair
  const MockUniswapV2Pair = await ethers.getContractFactory('MockUniswapV2Pair', deployer);
  const busdToFndzPair = await MockUniswapV2Pair.deploy(
    busdToken.address,
    fndzToken.address,
    utils.parseEther('1000'),
    utils.parseEther('1000'),
    BigNumber.from('1000'),
  );
  const daiToFndzPair = await MockUniswapV2Pair.deploy(
    daiToken.address,
    fndzToken.address,
    utils.parseEther('1000'),
    utils.parseEther('1000'),
    BigNumber.from('1000'),
  );
  // Pair creation and registering to route WBTC->USDC->FNDZ
  const wbtcToUsdcPair = await MockUniswapV2Pair.deploy(
    wbtcToken.address,
    usdcToken.address,
    utils.parseUnits('1000', 8),
    utils.parseUnits('1000', 6),
    BigNumber.from('1000'),
  );
  const usdcToFndzPair = await MockUniswapV2Pair.deploy(
    usdcToken.address,
    fndzToken.address,
    utils.parseUnits('1000', 6),
    utils.parseEther('1000'),
    BigNumber.from('1000'),
  );
  const MockUniswapV2Factory = await hre.ethers.getContractFactory('MockUniswapV2Factory', deployer);
  const mockUniswapV2Factory = MockUniswapV2Factory.attach(contracts.MockUniswapV2Factory);
  await mockUniswapV2Factory.registerPair(busdToken.address, fndzToken.address, busdToFndzPair.address);
  await mockUniswapV2Factory.registerPair(daiToken.address, fndzToken.address, daiToFndzPair.address);
  await mockUniswapV2Factory.registerPair(wbtcToken.address, usdcToken.address, wbtcToUsdcPair.address);
  await mockUniswapV2Factory.registerPair(usdcToken.address, fndzToken.address, usdcToFndzPair.address);
});

describe('FNDZStaking test suite', async function () {
  describe('Staking Tests', async function () {
    it('should be able to stake FNDZ tokens', async function () {
      const stakeAmount = utils.parseEther('1000');
      const fndzBalanceBeforeStake = await fndzToken.balanceOf(deployer.address);
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      let stakeTx = await fndzStaking.stakeFNDZ(stakeAmount);
      let stakeReceipt = await stakeTx.wait();
      let stakedEvents = filterEventsByABI(stakeReceipt, [fndzStakedEventABI]);
      expect(stakedEvents.length).to.equal(1);
      expect(stakedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(stakedEvents[0].args.stakedAmount).to.equal(stakeAmount);
      // Stake Transfer Event
      const transferEvents = filterEventsByABI(stakeReceipt, [transferABI]);
      expect(transferEvents.length).to.equal(1);
      expect(transferEvents[0].args.from).to.equal(deployer.address);
      expect(transferEvents[0].args.to).to.equal(fndzStaking.address);
      expect(transferEvents[0].args.value).to.equal(stakeAmount);
      expect(await fndzToken.balanceOf(deployer.address)).to.equal(fndzBalanceBeforeStake.sub(stakeAmount));
      expect(await fndzStaking.getStakedAmount(deployer.address)).to.equal(stakeAmount);
      expect(await fndzStaking.totalFNDZStaked()).to.equal(stakeAmount);
      let stakeUpdatedAt = (await ethers.provider.getBlock('latest')).timestamp;
      let stakeInfo = await fndzStaking.stakeholderToStakeInfo(deployer.address);
      expect(stakeInfo[0]).to.equal(stakeAmount);
      expect(stakeInfo[1]).to.equal(stakeUpdatedAt);
      expect(stakeInfo[2]).to.equal(false);

      // Can stake multiple times
      const prevStakedAmount = stakeAmount;
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      stakeTx = await fndzStaking.stakeFNDZ(stakeAmount);
      stakeReceipt = await stakeTx.wait();
      stakedEvents = filterEventsByABI(stakeReceipt, [fndzStakedEventABI]);
      expect(stakedEvents.length).to.equal(1);
      expect(stakedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(stakedEvents[0].args.stakedAmount).to.equal(prevStakedAmount);
      expect(await fndzStaking.getStakedAmount(deployer.address)).to.equal(prevStakedAmount.add(stakeAmount));
      expect(await fndzStaking.totalFNDZStaked()).to.equal(prevStakedAmount.add(stakeAmount));
      stakeUpdatedAt = (await ethers.provider.getBlock('latest')).timestamp;
      stakeInfo = await fndzStaking.stakeholderToStakeInfo(deployer.address);
      expect(stakeInfo[0]).to.equal(prevStakedAmount.add(stakeAmount));
      expect(stakeInfo[1]).to.equal(stakeUpdatedAt);
      expect(stakeInfo[2]).to.equal(false);
    });

    it('staking contract should be approved with the stake amount before staking', async function () {
      const stakeAmount = utils.parseEther('1000');
      await expect(fndzStaking.stakeFNDZ(stakeAmount)).to.revertedWith('ERC20: transfer amount exceeds allowance');

      await fndzToken.approve(fndzStaking.address, stakeAmount);
      const stakeTx = await fndzStaking.stakeFNDZ(stakeAmount);
      const stakeReceipt = await stakeTx.wait();
      const stakedEvents = filterEventsByABI(stakeReceipt, [fndzStakedEventABI]);
      expect(stakedEvents.length).to.equal(1);
    });

    it('Should update the earned reward tokens if the stake is updated', async function () {
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Atleast a day should be passed to get the Earned Rewards
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      let stakeTx = await fndzStaking.stakeFNDZ(stakeAmount);
      let stakeReceipt = await stakeTx.wait();
      let rewardsUpdatedEvents = filterEventsByABI(stakeReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(0);

      // Advancing the time to get some rewards
      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);

      // Finding the tracked assets balance before claim
      const trackedAssetsBalancesBeforeClaim = [];
      const trackedAssets = await fndzStaking.getTrackedAssets();
      for (var i = 0; i < trackedAssets.length; i++) {
        trackedAssetsBalancesBeforeClaim.push(await fndzStaking.getRewardBalance(trackedAssets[i]));
      }

      const fndzStaked = await fndzStaking.getStakedAmount(deployer.address);
      const totalFNDZStaked = await fndzStaking.totalFNDZStaked();
      const expectedRewardFraction = fndzStaked.mul(totalDays).mul(utils.parseEther('1')).div(totalFNDZStaked).div(365);

      await fndzToken.approve(fndzStaking.address, stakeAmount);
      stakeTx = await fndzStaking.stakeFNDZ(stakeAmount);
      stakeReceipt = await stakeTx.wait();
      rewardsUpdatedEvents = filterEventsByABI(stakeReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const earnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const earnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      for (var i = 0; i < earnedAssets.length; i++) {
        var expectedRewardAmount = trackedAssetsBalancesBeforeClaim[i]
          .mul(expectedRewardFraction)
          .div(utils.parseEther('1'));
        expect(earnedAmounts[i]).to.equal(expectedRewardAmount);
        expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(earnedAssets[i])).to.equal(
          expectedRewardAmount,
        );
      }
      const stakeUpdatedAt = (await ethers.provider.getBlock('latest')).timestamp;
      const stakeInfo = await fndzStaking.stakeholderToStakeInfo(deployer.address);
      expect(stakeInfo[0]).to.equal(stakeAmount.mul(3));
      expect(stakeInfo[1]).to.equal(stakeUpdatedAt);
      expect(stakeInfo[2]).to.equal(true);
    });

    it('Should update stake order link correctly', async function () {
      const stakeAmount = utils.parseEther('1000');
      // User1 is staking
      const user1 = deployer;
      await fndzToken.connect(user1).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user1).stakeFNDZ(stakeAmount);

      // Now the link will be
      // user1

      expect(await fndzStaking.firstStakeholder()).to.equal(user1.address);
      expect(await fndzStaking.lastStakeholder()).to.equal(user1.address);
      let stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user1.address);
      expect(stakeOrderLink[0]).to.equal(AddressZero);
      expect(stakeOrderLink[1]).to.equal(AddressZero);

      // Stake by user2
      const user2 = accounts[1];
      const prevStakedAmount = stakeAmount;
      await fndzToken.connect(user2).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user2).stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(accounts[1].address)).to.equal(stakeAmount);
      expect(await fndzStaking.totalFNDZStaked()).to.equal(stakeAmount.add(prevStakedAmount));

      // Now the link will be
      // user1 <-> user2

      expect(await fndzStaking.firstStakeholder()).to.equal(user1.address);
      expect(await fndzStaking.lastStakeholder()).to.equal(user2.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user1.address);
      expect(stakeOrderLink[0]).to.equal(AddressZero);
      expect(stakeOrderLink[1]).to.equal(user2.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user2.address);
      expect(stakeOrderLink[0]).to.equal(user1.address);
      expect(stakeOrderLink[1]).to.equal(AddressZero);

      // Stake by user3
      const user3 = accounts[2];
      await fndzToken.connect(user3).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user3).stakeFNDZ(stakeAmount);

      // Now the link will be
      // user1 <-> user2 <-> user3

      expect(await fndzStaking.firstStakeholder()).to.equal(user1.address);
      expect(await fndzStaking.lastStakeholder()).to.equal(user3.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user2.address);
      expect(stakeOrderLink[0]).to.equal(user1.address);
      expect(stakeOrderLink[1]).to.equal(user3.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user3.address);
      expect(stakeOrderLink[0]).to.equal(user2.address);
      expect(stakeOrderLink[1]).to.equal(AddressZero);

      // Stake by user1 again
      // If the user1 staked again he will be moved to last
      // To ensure the adding functionality with the existing address
      await fndzToken.connect(user1).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user1).stakeFNDZ(stakeAmount);

      // Now the link will be
      // user2 <-> user3 <-> user1
      expect(await fndzStaking.firstStakeholder()).to.equal(user2.address);
      expect(await fndzStaking.lastStakeholder()).to.equal(user1.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user2.address);
      expect(stakeOrderLink[0]).to.equal(AddressZero);
      expect(stakeOrderLink[1]).to.equal(user3.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user3.address);
      expect(stakeOrderLink[0]).to.equal(user2.address);
      expect(stakeOrderLink[1]).to.equal(user1.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user1.address);
      expect(stakeOrderLink[0]).to.equal(user3.address);
      expect(stakeOrderLink[1]).to.equal(AddressZero);
    });

    it('stake amount should be greater than zero', async function () {
      await expect(fndzStaking.stakeFNDZ(0)).to.revertedWith('_stakeAmount: Empty __stakeAmount');
    });
  });

  describe('UnStake Tests', async function () {
    it('Should be able to unstake total staked FNDZ tokens', async function () {
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(deployer.address)).to.equal(stakeAmount);
      const stakeUpdatedAt = (await ethers.provider.getBlock('latest')).timestamp;
      let stakeInfo = await fndzStaking.stakeholderToStakeInfo(deployer.address);
      expect(stakeInfo[0]).to.equal(stakeAmount);
      expect(stakeInfo[1]).to.equal(stakeUpdatedAt);
      expect(stakeInfo[2]).to.equal(false);

      const stakedAmount = await fndzStaking.getStakedAmount(deployer.address);
      const unstakeTx = await fndzStaking.unstakeFNDZ(stakedAmount);
      const unstakeReceipt = await unstakeTx.wait();
      const unstakeEvents = filterEventsByABI(unstakeReceipt, [unstakeEventABI]);
      expect(unstakeEvents.length).to.equal(1);
      expect(unstakeEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(unstakeEvents[0].args.unstakedAmount).to.equal(stakedAmount);
      expect(await fndzStaking.getStakedAmount(deployer.address)).to.equal(0);
      expect(await fndzStaking.totalFNDZStaked()).to.equal(0);
      expect(await fndzStaking.totalUnstakedFNDZ()).to.equal(stakedAmount);
      stakeInfo = await fndzStaking.stakeholderToStakeInfo(deployer.address);
      expect(stakeInfo[0]).to.equal(0);
      expect(stakeInfo[1]).to.equal(0);
      expect(stakeInfo[2]).to.equal(false);
      const unstakeInfo = await fndzStaking.stakeholderToUnstakeInfo(deployer.address);
      expect(unstakeInfo.unstakedAmount).to.equal(stakedAmount);
      expect(unstakeInfo.unstakedAt).to.equal((await ethers.provider.getBlock('latest')).timestamp);
    });

    it('Should be able to unstake staked FNDZ tokens partially', async function () {
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(deployer.address)).to.equal(stakeAmount);
      const stakeUpdatedAt = (await ethers.provider.getBlock('latest')).timestamp;
      let stakeInfo = await fndzStaking.stakeholderToStakeInfo(deployer.address);
      expect(stakeInfo[0]).to.equal(stakeAmount);
      expect(stakeInfo[1]).to.equal(stakeUpdatedAt);
      expect(stakeInfo[2]).to.equal(false);

      const stakedAmount = stakeAmount;
      const unstakeAmount = utils.parseEther('100');
      const unstakeTx = await fndzStaking.unstakeFNDZ(unstakeAmount);
      const unstakeReceipt = await unstakeTx.wait();
      const unstakeEvents = filterEventsByABI(unstakeReceipt, [unstakeEventABI]);
      expect(unstakeEvents.length).to.equal(1);
      expect(unstakeEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(unstakeEvents[0].args.unstakedAmount).to.equal(unstakeAmount);
      expect(await fndzStaking.getStakedAmount(deployer.address)).to.equal(stakedAmount.sub(unstakeAmount));
      expect(await fndzStaking.totalFNDZStaked()).to.equal(stakedAmount.sub(unstakeAmount));
      expect(await fndzStaking.totalUnstakedFNDZ()).to.equal(unstakeAmount);
      stakeInfo = await fndzStaking.stakeholderToStakeInfo(deployer.address);
      expect(stakeInfo[0]).to.equal(stakedAmount.sub(unstakeAmount));
      expect(stakeInfo[1]).to.equal((await ethers.provider.getBlock('latest')).timestamp);
      expect(stakeInfo[2]).to.equal(false);
    });

    it('Can not unstake again if some tokens were already unstaked and not withdrawn', async function () {
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(deployer.address)).to.equal(stakeAmount);

      const stakedAmount = stakeAmount;
      await fndzStaking.unstakeFNDZ(stakedAmount);

      await expect(fndzStaking.unstakeFNDZ(stakedAmount)).to.revertedWith(
        'stakeholder already has some unstaked tokens',
      );
    });

    it('unstake amount should be lesser than or equal to staked amount', async function () {
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(deployer.address)).to.equal(stakeAmount);

      const stakedAmount = stakeAmount;
      await expect(fndzStaking.unstakeFNDZ(stakedAmount.add(1))).to.revertedWith('Insufficient staked amount');
    });

    it('Should update the earned FNDZ tokens if the rewards applicable', async function () {
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(deployer.address)).to.equal(stakeAmount);
      const stakedAmount = stakeAmount;

      // Advancing the time to get some rewards
      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);

      // Finding the tracked assets balance before claim
      const trackedAssetsBalancesBeforeClaim = [];
      const trackedAssets = await fndzStaking.getTrackedAssets();
      for (var i = 0; i < trackedAssets.length; i++) {
        trackedAssetsBalancesBeforeClaim.push(await fndzStaking.getRewardBalance(trackedAssets[i]));
      }

      const fndzStaked = await fndzStaking.getStakedAmount(deployer.address);
      const totalFNDZStaked = await fndzStaking.totalFNDZStaked();
      const expectedRewardFraction = fndzStaked.mul(totalDays).mul(utils.parseEther('1')).div(totalFNDZStaked).div(365);

      const unstakeTx = await fndzStaking.unstakeFNDZ(stakedAmount);
      const unstakeReceipt = await unstakeTx.wait();
      const rewardsUpdatedEvents = filterEventsByABI(unstakeReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const earnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const earnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      for (var i = 0; i < earnedAssets.length; i++) {
        var expectedRewardAmount = trackedAssetsBalancesBeforeClaim[i]
          .mul(expectedRewardFraction)
          .div(utils.parseEther('1'));
        expect(earnedAmounts[i]).to.equal(expectedRewardAmount);
        expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(earnedAssets[i])).to.equal(
          expectedRewardAmount,
        );
      }
      const stakeInfo = await fndzStaking.stakeholderToStakeInfo(deployer.address);
      expect(stakeInfo[0]).to.equal(0);
      expect(stakeInfo[1]).to.equal(0);
      expect(stakeInfo[2]).to.equal(true);
    });

    it('Should update stake order link correctly', async function () {
      const stakeAmount = utils.parseEther('1000');

      // User1 staking
      const user1 = deployer;
      await fndzToken.connect(user1).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user1).stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(user1.address)).to.equal(stakeAmount);

      // User2 staking
      const user2 = accounts[1];
      await fndzToken.connect(user2).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user2).stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(user2.address)).to.equal(stakeAmount);

      // User3 staking
      const user3 = accounts[2];
      await fndzToken.connect(user3).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user3).stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(user3.address)).to.equal(stakeAmount);

      // User4 staking
      const user4 = accounts[3];
      await fndzToken.connect(user4).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user4).stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(user4.address)).to.equal(stakeAmount);

      // Now the link will be
      // user1 <-> user2 <-> user3 <-> user4

      // user2 unstakes partially - should change the link
      const stakedAmount = stakeAmount;
      await fndzStaking.connect(user2).unstakeFNDZ(stakedAmount.div(2));
      expect(await fndzStaking.firstStakeholder()).to.equal(user1.address);
      expect(await fndzStaking.lastStakeholder()).to.equal(user2.address);
      let stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user1.address);
      expect(stakeOrderLink[0]).to.equal(AddressZero);
      expect(stakeOrderLink[1]).to.equal(user3.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user3.address);
      expect(stakeOrderLink[0]).to.equal(user1.address);
      expect(stakeOrderLink[1]).to.equal(user4.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user4.address);
      expect(stakeOrderLink[0]).to.equal(user3.address);
      expect(stakeOrderLink[1]).to.equal(user2.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user2.address);
      expect(stakeOrderLink[0]).to.equal(user4.address);
      expect(stakeOrderLink[1]).to.equal(AddressZero);
      // withdrawing the unstake
      await fndzStaking.connect(user2).withdrawFNDZ(stakedAmount.div(2));

      // user2 unstakes remaining amount
      await fndzStaking.connect(user2).unstakeFNDZ(stakedAmount.div(2));
      expect(await fndzStaking.firstStakeholder()).to.equal(user1.address);
      expect(await fndzStaking.lastStakeholder()).to.equal(user4.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user1.address);
      expect(stakeOrderLink[0]).to.equal(AddressZero);
      expect(stakeOrderLink[1]).to.equal(user3.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user3.address);
      expect(stakeOrderLink[0]).to.equal(user1.address);
      expect(stakeOrderLink[1]).to.equal(user4.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user4.address);
      expect(stakeOrderLink[0]).to.equal(user3.address);
      expect(stakeOrderLink[1]).to.equal(AddressZero);

      // Now the link will be
      // user1 <-> user3 <-> user4

      // user4 unstakes (unstake at the end of the link)
      await fndzStaking.connect(user4).unstakeFNDZ(stakedAmount);
      expect(await fndzStaking.firstStakeholder()).to.equal(user1.address);
      expect(await fndzStaking.lastStakeholder()).to.equal(user3.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user1.address);
      expect(stakeOrderLink[0]).to.equal(AddressZero);
      expect(stakeOrderLink[1]).to.equal(user3.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user3.address);
      expect(stakeOrderLink[0]).to.equal(user1.address);
      expect(stakeOrderLink[1]).to.equal(AddressZero);

      // Now the link will be
      // user1 <-> user3

      // user1 unstakes (unstake at the start of the link)
      await fndzStaking.connect(user1).unstakeFNDZ(stakeAmount);
      expect(await fndzStaking.firstStakeholder()).to.equal(user3.address);
      expect(await fndzStaking.lastStakeholder()).to.equal(user3.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user3.address);
      expect(stakeOrderLink[0]).to.equal(AddressZero);
      expect(stakeOrderLink[1]).to.equal(AddressZero);

      // Now the link will be
      // user3

      // user3 unstakes (unstake at the start of the link)
      await fndzStaking.connect(user3).unstakeFNDZ(stakedAmount);
      expect(await fndzStaking.firstStakeholder()).to.equal(AddressZero);
      expect(await fndzStaking.lastStakeholder()).to.equal(AddressZero);
    });

    it('unstake amount should be greater than zero', async function () {
      await expect(fndzStaking.unstakeFNDZ(0)).to.revertedWith('__unstakeFNDZ: Empty _unstakeAmount');
    });
  });

  describe('Withdraw Tests', async function () {
    it('Should be able to withdraw (Total Stake) without Fee if the FNDZ unstaked and locking period completed', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // unstaking FNDZ
      await fndzStaking.unstakeFNDZ(stakeAmount);
      expect(await fndzStaking.totalUnstakedFNDZ()).to.equal(stakeAmount);

      // Advancing the time to complete the locking period
      await advanceTime((await fndzStaking.unstakeTimelock()).toNumber());

      // Withdrawing FNDZ
      const withdrawTx = await fndzStaking.withdrawFNDZ(stakeAmount);
      const withdrawReceipt = await withdrawTx.wait();
      const withdrawnEvents = filterEventsByABI(withdrawReceipt, [fndzWithdrawnEventABI]);
      expect(withdrawnEvents.length).to.equal(1);
      expect(withdrawnEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(withdrawnEvents[0].args.unstakedAmount).to.equal(stakeAmount);
      expect(withdrawnEvents[0].args.withdrawnAmount).to.equal(stakeAmount);
      expect(await fndzStaking.totalUnstakedFNDZ()).to.equal(0);
      const unstakeInfo = await fndzStaking.stakeholderToUnstakeInfo(deployer.address);
      expect(unstakeInfo.unstakedAmount).to.equal(0);
      expect(unstakeInfo.unstakedAt).to.equal(0);

      // Withdraw FNDZ Transfer Event
      const transferEvents = filterEventsByABI(withdrawReceipt, [transferABI]);
      expect(transferEvents.length).to.equal(1);
      expect(transferEvents[0].args.from).to.equal(fndzStaking.address);
      expect(transferEvents[0].args.to).to.equal(deployer.address);
      expect(transferEvents[0].args.value).to.equal(stakeAmount);
    });

    it('withdraw amount should be equal to unstaked amount', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // unstaking FNDZ
      await fndzStaking.unstakeFNDZ(stakeAmount);
      expect(await fndzStaking.totalUnstakedFNDZ()).to.equal(stakeAmount);

      // Advancing the time to complete the locking period
      advanceTime((await fndzStaking.unstakeTimelock()).toNumber());

      const unstakedAmount = stakeAmount;
      await expect(fndzStaking.withdrawFNDZ(unstakedAmount.add(1))).to.revertedWith(
        'withdraw amount must equal the unstaked amount',
      );
      await expect(fndzStaking.withdrawFNDZ(unstakedAmount.sub(1))).to.revertedWith(
        'withdraw amount must equal the unstaked amount',
      );
    });

    it('Fee should be settled when tokens not unstaked or unstaked but the locking period is not completed', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Partial Unstake
      let unstakeAmount = utils.parseEther('400');
      await fndzStaking.unstakeFNDZ(unstakeAmount);
      expect(await fndzStaking.totalUnstakedFNDZ()).to.equal(unstakeAmount);

      let expectedFee = unstakeAmount.mul(await fndzStaking.unstakeFeeRate()).div(utils.parseEther('1'));
      let withdrawTx = await fndzStaking.withdrawFNDZ(unstakeAmount);
      let withdrawReceipt = await withdrawTx.wait();
      expect(await fndzStaking.totalUnstakedFNDZ()).to.equal(0);
      let withdrawnEvents = filterEventsByABI(withdrawReceipt, [fndzWithdrawnEventABI]);
      expect(withdrawnEvents.length).to.equal(1);
      expect(withdrawnEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(withdrawnEvents[0].args.unstakedAmount).to.equal(unstakeAmount);
      expect(withdrawnEvents[0].args.withdrawnAmount).to.equal(unstakeAmount.sub(expectedFee));
      let feeSettledEvents = filterEventsByABI(withdrawReceipt, [withdrawFeeSettledEventABI]);
      expect(feeSettledEvents.length).to.equal(1);
      expect(feeSettledEvents[0].args.payer).to.equal(deployer.address);
      expect(feeSettledEvents[0].args.payee).to.equal(await fndzController.fndzDao());
      expect(feeSettledEvents[0].args.unstakeAmount).to.equal(unstakeAmount);
      expect(feeSettledEvents[0].args.feeAmount).to.equal(expectedFee);
      let transferEvents = filterEventsByABI(withdrawReceipt, [transferABI]);
      expect(transferEvents.length).to.equal(2);
      // Fee Transfer Event
      expect(transferEvents[0].args.from).to.equal(fndzStaking.address);
      expect(transferEvents[0].args.to).to.equal(await fndzController.fndzDao());
      expect(transferEvents[0].args.value).to.equal(expectedFee);
      // Withdraw FNDZ Transfer Event
      expect(transferEvents[1].args.from).to.equal(fndzStaking.address);
      expect(transferEvents[1].args.to).to.equal(deployer.address);
      expect(transferEvents[1].args.value).to.equal(unstakeAmount.sub(expectedFee));

      // Withdraw without unstaking (Total Stake)
      unstakeAmount = await fndzStaking.getStakedAmount(deployer.address);
      expectedFee = unstakeAmount.mul(await fndzStaking.unstakeFeeRate()).div(utils.parseEther('1'));
      withdrawTx = await fndzStaking.withdrawFNDZ(unstakeAmount);
      withdrawReceipt = await withdrawTx.wait();
      expect(await fndzStaking.totalUnstakedFNDZ()).to.equal(0);
      withdrawnEvents = filterEventsByABI(withdrawReceipt, [fndzWithdrawnEventABI]);
      expect(withdrawnEvents.length).to.equal(1);
      expect(withdrawnEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(withdrawnEvents[0].args.unstakedAmount).to.equal(unstakeAmount);
      expect(withdrawnEvents[0].args.withdrawnAmount).to.equal(unstakeAmount.sub(expectedFee));
      feeSettledEvents = filterEventsByABI(withdrawReceipt, [withdrawFeeSettledEventABI]);
      expect(feeSettledEvents.length).to.equal(1);
      expect(feeSettledEvents[0].args.payer).to.equal(deployer.address);
      expect(feeSettledEvents[0].args.payee).to.equal(await fndzController.fndzDao());
      expect(feeSettledEvents[0].args.unstakeAmount).to.equal(unstakeAmount);
      expect(feeSettledEvents[0].args.feeAmount).to.equal(expectedFee);
      transferEvents = filterEventsByABI(withdrawReceipt, [transferABI]);
      expect(transferEvents.length).to.equal(2);
      // Fee Transfer Event
      expect(transferEvents[0].args.from).to.equal(fndzStaking.address);
      expect(transferEvents[0].args.to).to.equal(await fndzController.fndzDao());
      expect(transferEvents[0].args.value).to.equal(expectedFee);
      // Withdraw FNDZ Transfer Event
      expect(transferEvents[1].args.from).to.equal(fndzStaking.address);
      expect(transferEvents[1].args.to).to.equal(deployer.address);
      expect(transferEvents[1].args.value).to.equal(unstakeAmount.sub(expectedFee));
    });

    it('Should update the earned FNDZ tokens before withdrawal (if not unstaked)', async function () {
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(deployer.address)).to.equal(stakeAmount);
      const stakedAmount = stakeAmount;

      // Advancing the time to get some rewards
      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);

      // Finding the tracked assets balance before claim
      const trackedAssetsBalancesBeforeClaim = [];
      const trackedAssets = await fndzStaking.getTrackedAssets();
      for (var i = 0; i < trackedAssets.length; i++) {
        trackedAssetsBalancesBeforeClaim.push(await fndzStaking.getRewardBalance(trackedAssets[i]));
      }

      const fndzStaked = await fndzStaking.getStakedAmount(deployer.address);
      const totalFNDZStaked = await fndzStaking.totalFNDZStaked();
      const expectedRewardFraction = fndzStaked.mul(totalDays).mul(utils.parseEther('1')).div(totalFNDZStaked).div(365);

      const withdrawTx = await fndzStaking.withdrawFNDZ(stakedAmount);
      const withdrawReceipt = await withdrawTx.wait();
      const rewardsUpdatedEvents = filterEventsByABI(withdrawReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const earnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const earnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      for (var i = 0; i < earnedAssets.length; i++) {
        var expectedRewardAmount = trackedAssetsBalancesBeforeClaim[i]
          .mul(expectedRewardFraction)
          .div(utils.parseEther('1'));
        expect(earnedAmounts[i]).to.equal(expectedRewardAmount);
        expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(earnedAssets[i])).to.equal(
          expectedRewardAmount,
        );
      }
      const stakeInfo = await fndzStaking.stakeholderToStakeInfo(deployer.address);
      expect(stakeInfo[0]).to.equal(0);
      expect(stakeInfo[1]).to.equal(0);
      expect(stakeInfo[2]).to.equal(true);
    });

    it('withdrawal amount should be lesser than or equal to staked amount (if not unstaked)', async function () {
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(deployer.address)).to.equal(stakeAmount);

      const stakedAmount = stakeAmount;
      await expect(fndzStaking.withdrawFNDZ(stakedAmount.add(1))).to.revertedWith('Insufficient staked amount');
    });

    it('Should update stake order link correctly (if not unstaked)', async function () {
      const stakeAmount = utils.parseEther('1000');

      // User1 staking
      const user1 = deployer;
      await fndzToken.connect(user1).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user1).stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(user1.address)).to.equal(stakeAmount);

      // User2 staking
      const user2 = accounts[1];
      await fndzToken.connect(user2).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user2).stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(user2.address)).to.equal(stakeAmount);

      // User3 staking
      const user3 = accounts[2];
      await fndzToken.connect(user3).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user3).stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(user3.address)).to.equal(stakeAmount);

      // User4 staking
      const user4 = accounts[3];
      await fndzToken.connect(user4).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user4).stakeFNDZ(stakeAmount);
      expect(await fndzStaking.getStakedAmount(user4.address)).to.equal(stakeAmount);

      // Now the link will be
      // user1 <-> user2 <-> user3 <-> user4

      // user2 withdraw partially - should change the link
      const stakedAmount = stakeAmount;
      await fndzStaking.connect(user2).withdrawFNDZ(stakedAmount.div(2));
      expect(await fndzStaking.firstStakeholder()).to.equal(user1.address);
      expect(await fndzStaking.lastStakeholder()).to.equal(user2.address);
      let stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user1.address);
      expect(stakeOrderLink[0]).to.equal(AddressZero);
      expect(stakeOrderLink[1]).to.equal(user3.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user3.address);
      expect(stakeOrderLink[0]).to.equal(user1.address);
      expect(stakeOrderLink[1]).to.equal(user4.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user4.address);
      expect(stakeOrderLink[0]).to.equal(user3.address);
      expect(stakeOrderLink[1]).to.equal(user2.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user2.address);
      expect(stakeOrderLink[0]).to.equal(user4.address);
      expect(stakeOrderLink[1]).to.equal(AddressZero);

      // Now the link will be
      // user1 <-> user3 <-> user4 <-> user2

      // user2 withdraw remaining
      await fndzStaking.connect(user2).withdrawFNDZ(stakedAmount.div(2));
      expect(await fndzStaking.firstStakeholder()).to.equal(user1.address);
      expect(await fndzStaking.lastStakeholder()).to.equal(user4.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user1.address);
      expect(stakeOrderLink[0]).to.equal(AddressZero);
      expect(stakeOrderLink[1]).to.equal(user3.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user3.address);
      expect(stakeOrderLink[0]).to.equal(user1.address);
      expect(stakeOrderLink[1]).to.equal(user4.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user4.address);
      expect(stakeOrderLink[0]).to.equal(user3.address);
      expect(stakeOrderLink[1]).to.equal(AddressZero);

      // Now the link will be
      // user1 <-> user3 <-> user4

      // user4 withdraw (unstake at the end of the link)
      await fndzStaking.connect(user4).withdrawFNDZ(stakedAmount);
      expect(await fndzStaking.firstStakeholder()).to.equal(user1.address);
      expect(await fndzStaking.lastStakeholder()).to.equal(user3.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user1.address);
      expect(stakeOrderLink[0]).to.equal(AddressZero);
      expect(stakeOrderLink[1]).to.equal(user3.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user3.address);
      expect(stakeOrderLink[0]).to.equal(user1.address);
      expect(stakeOrderLink[1]).to.equal(AddressZero);

      // Now the link will be
      // user1 <-> user3

      // user1 withdraw (unstake at the start of the link)
      await fndzStaking.connect(user1).withdrawFNDZ(stakedAmount);
      expect(await fndzStaking.firstStakeholder()).to.equal(user3.address);
      expect(await fndzStaking.lastStakeholder()).to.equal(user3.address);
      stakeOrderLink = await fndzStaking.stakeholderToStakeOrderLink(user3.address);
      expect(stakeOrderLink[0]).to.equal(AddressZero);
      expect(stakeOrderLink[1]).to.equal(AddressZero);

      // Now the link will be
      // user3

      // user3 withdraw (unstake at the start of the link)
      await fndzStaking.connect(user3).withdrawFNDZ(stakedAmount);
      expect(await fndzStaking.firstStakeholder()).to.equal(AddressZero);
      expect(await fndzStaking.lastStakeholder()).to.equal(AddressZero);
    });

    it('withdraw amount should be greater than zero', async function () {
      await expect(fndzStaking.withdrawFNDZ(0)).to.revertedWith('__unstakeFNDZ: Empty _unstakeAmount');
    });
  });

  describe('Claim Rewards Tests', async function () {
    it('Should be able to claim the applicable rewards as FNDZ Tokens', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Adding WBTC rewards to the pool
      await fndzStaking.addTrackedAssets([wbtcToken.address, daiToken.address]);

      // Adding rewards to the Pool
      await wbtcToken.mintFor(fndzStaking.address, utils.parseUnits('1000', 8));
      await daiToken.mintFor(fndzStaking.address, utils.parseUnits('1000', 18));

      // Adding rewards to the Pool
      await wbtcToken.mintFor(fndzStaking.address, utils.parseUnits('1000', 8));

      // Advancing the time to get some rewards

      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);

      // Finding the tracked assets balance before claim
      const trackedAssetsBalancesBeforeClaim = [];
      const trackedAssets = await fndzStaking.getTrackedAssets();
      for (var i = 0; i < trackedAssets.length; i++) {
        trackedAssetsBalancesBeforeClaim.push(await fndzStaking.getRewardBalance(trackedAssets[i]));
      }

      const fndzBalanceBeforeClaim = await fndzToken.balanceOf(deployer.address);
      const fndzStaked = await fndzStaking.getStakedAmount(deployer.address);
      const totalFNDZStaked = await fndzStaking.totalFNDZStaked();
      const expectedRewardFraction = fndzStaked.mul(totalDays).mul(utils.parseEther('1')).div(totalFNDZStaked).div(365);

      // Exclude daiToken from trackedAssets

      const swapData = abiCoder.encode(
        ['address[]', 'address[][]', 'uint256[]'],
        [
          [wbtcToken.address, busdToken.address],
          [
            [wbtcToken.address, usdcToken.address, fndzToken.address],
            [busdToken.address, fndzToken.address],
          ],
          [utils.parseUnits('10', 8), utils.parseEther('10')],
        ],
      );
      const assetsToInclude = [wbtcToken.address, busdToken.address];
      const claimTx = await fndzStaking.claimRewardsAsFNDZ(swapData);
      const claimReceipt = await claimTx.wait();
      // Earned Rewards update event
      const rewardsUpdatedEvents = filterEventsByABI(claimReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const earnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const earnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      for (var i = 0; i < earnedAssets.length; i++) {
        var expectedRewardAmount = trackedAssetsBalancesBeforeClaim[i]
          .mul(expectedRewardFraction)
          .div(utils.parseEther('1'));
        expect(earnedAmounts[i]).to.equal(expectedRewardAmount);
        if (assetsToInclude.includes(earnedAssets[i])) {
          expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(earnedAssets[i])).to.equal(0);
        } else {
          expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(earnedAssets[i])).to.not.equal(0);
        }
      }
      const assetSwappedEvents = filterEventsByABI(claimReceipt, [assetSwappedEventABI]);
      var swappedFNDZ = BigNumber.from('0');
      for (var i = 0; i < assetSwappedEvents.length; i++) {
        swappedFNDZ = swappedFNDZ.add(assetSwappedEvents[i].args.destinationAmount);
      }

      // Reward Claimed Event
      const claimEvents = filterEventsByABI(claimReceipt, [rewardsClaimedAsFNDZEventABI]);
      expect(claimEvents.length).to.equal(1);
      expect(claimEvents[0].args.stakeholder).to.equal(deployer.address);

      const claimedFNDZ = claimEvents[0].args.claimedFNDZ;

      expect(claimedFNDZ).to.equal(swappedFNDZ);
      expect(await fndzToken.balanceOf(deployer.address)).to.equal(fndzBalanceBeforeClaim.add(swappedFNDZ));
      const stakeUpdatedAt = (await ethers.provider.getBlock('latest')).timestamp;
      const stakeInfo = await fndzStaking.stakeholderToStakeInfo(deployer.address);
      expect(stakeInfo.stakedAmount).to.equal(stakeAmount);
      expect(stakeInfo.hasEarnedRewards).to.equal(false);
      expect(stakeInfo.stakeUpdatedAt).to.equal(stakeUpdatedAt);
    });

    it('Should be able to transfer assets directly if price impact is high when claims as FNDZ', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Adding WBTC rewards to the pool
      await fndzStaking.addTrackedAssets([wbtcToken.address]);

      // Adding rewards to the Pool
      await wbtcToken.mintFor(fndzStaking.address, utils.parseUnits('1000', 8));

      // Advancing the time to get some rewards
      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);

      // Finding the tracked assets balance before claim
      const trackedAssetsBalancesBeforeClaim = [];
      const stakeholderBalancesBeforeClaim = [];
      const trackedAssets = await fndzStaking.getTrackedAssets();
      const MockToken = await ethers.getContractFactory('MockToken');
      for (var i = 0; i < trackedAssets.length; i++) {
        trackedAssetsBalancesBeforeClaim.push(await fndzStaking.getRewardBalance(trackedAssets[i]));
        var trackedAsset = MockToken.attach(trackedAssets[i]);
        stakeholderBalancesBeforeClaim.push(await trackedAsset.balanceOf(deployer.address));
      }

      const fndzBalanceBeforeClaim = await fndzToken.balanceOf(deployer.address);
      const fndzStaked = await fndzStaking.getStakedAmount(deployer.address);
      const totalFNDZStaked = await fndzStaking.totalFNDZStaked();
      const expectedRewardFraction = fndzStaked.mul(totalDays).mul(utils.parseEther('1')).div(totalFNDZStaked).div(365);

      // Exclude daiToken from trackedAssets
      const swapData = abiCoder.encode(
        ['address[]', 'address[][]', 'uint256[]'],
        [
          [wbtcToken.address, busdToken.address],
          [
            // Pass empty path for high price impact token(wBTC)
            [],
            [busdToken.address, fndzToken.address],
          ],
          [utils.parseUnits('10', 8), utils.parseEther('10')],
        ],
      );
      const assetsToInclude = [wbtcToken.address, busdToken.address];
      const claimTx = await fndzStaking.claimRewardsAsFNDZ(swapData);
      const claimReceipt = await claimTx.wait();
      // Earned Rewards update event
      const rewardsUpdatedEvents = filterEventsByABI(claimReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const earnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const earnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      for (var i = 0; i < earnedAssets.length; i++) {
        var expectedRewardAmount = trackedAssetsBalancesBeforeClaim[i]
          .mul(expectedRewardFraction)
          .div(utils.parseEther('1'));
        expect(earnedAmounts[i]).to.equal(expectedRewardAmount);
        if (assetsToInclude.includes(earnedAssets[i])) {
          expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(earnedAssets[i])).to.equal(0);
        } else {
          expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(earnedAssets[i])).to.not.equal(0);
        }
      }
      const assetSwappedEvents = filterEventsByABI(claimReceipt, [assetSwappedEventABI]);
      var swappedFNDZ = BigNumber.from('0');
      const swappedAssets = [];
      for (var i = 0; i < assetSwappedEvents.length; i++) {
        swappedFNDZ = swappedFNDZ.add(assetSwappedEvents[i].args.destinationAmount);
        swappedAssets.push(assetSwappedEvents[i].args.sourceAsset);
      }

      // Checking the balance of high price impact tokens if transferred successfully
      for (var i = 0; i < trackedAssets.length; i++) {
        if (assetsToInclude.includes(trackedAssets[i]) && !swappedAssets.includes(trackedAssets[i])) {
          const index = earnedAssets.indexOf(trackedAssets[i]);
          if (index != -1) {
            var trackedAsset = MockToken.attach(trackedAssets[i]);
            expect(await trackedAsset.balanceOf(deployer.address)).to.equal(
              stakeholderBalancesBeforeClaim[i].add(earnedAmounts[index]),
            );
          }
        }
      }

      // Reward Claimed Event
      const claimEvents = filterEventsByABI(claimReceipt, [rewardsClaimedAsFNDZEventABI]);
      expect(claimEvents.length).to.equal(1);
      expect(claimEvents[0].args.stakeholder).to.equal(deployer.address);

      const claimedFNDZ = claimEvents[0].args.claimedFNDZ;

      expect(claimedFNDZ).to.equal(swappedFNDZ);
      expect(await fndzToken.balanceOf(deployer.address)).to.equal(fndzBalanceBeforeClaim.add(swappedFNDZ));
      const stakeUpdatedAt = (await ethers.provider.getBlock('latest')).timestamp;
      const stakeInfo = await fndzStaking.stakeholderToStakeInfo(deployer.address);
      expect(stakeInfo.stakedAmount).to.equal(stakeAmount);
      expect(stakeInfo.hasEarnedRewards).to.equal(false);
      expect(stakeInfo.stakeUpdatedAt).to.equal(stakeUpdatedAt);
    });

    it('Should be able to claim the applicable rewards as Underlying Tracked Tokens', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Advancing the time to get some rewards
      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);

      const fndzStaked = await fndzStaking.getStakedAmount(deployer.address);
      const totalFNDZStaked = await fndzStaking.totalFNDZStaked();
      const expectedRewardFraction = fndzStaked.mul(totalDays).mul(utils.parseEther('1')).div(totalFNDZStaked).div(365);

      // Finding the tracked assets balance before claim
      const MockToken = await ethers.getContractFactory('MockToken');
      const trackedAssetsBalancesBeforeClaim = [];
      const stakeholderBalancesBeforeClaim = [];
      const trackedAssets = await fndzStaking.getTrackedAssets();
      for (var i = 0; i < trackedAssets.length; i++) {
        trackedAssetsBalancesBeforeClaim.push(await fndzStaking.getRewardBalance(trackedAssets[i]));
        var trackedAsset = MockToken.attach(trackedAssets[i]);
        stakeholderBalancesBeforeClaim.push(await trackedAsset.balanceOf(deployer.address));
      }

      const claimTx = await fndzStaking.claimRewards([]); // TRACKED_ASSETS
      const claimReceipt = await claimTx.wait();
      // Earned Rewards update event
      const rewardsUpdatedEvents = filterEventsByABI(claimReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const earnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const earnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      for (var i = 0; i < earnedAssets.length; i++) {
        var expectedRewardAmount = trackedAssetsBalancesBeforeClaim[i]
          .mul(expectedRewardFraction)
          .div(utils.parseEther('1'));
        expect(earnedAmounts[i]).to.equal(expectedRewardAmount);
        expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(earnedAssets[i])).to.equal(0);
      }

      // Reward Claimed Event
      const claimEvents = filterEventsByABI(claimReceipt, [rewardsClaimedAsTrackedAssetsEventABI]);
      expect(claimEvents.length).to.equal(1);
      expect(claimEvents[0].args.stakeholder).to.equal(deployer.address);
      const rewardedAssets = claimEvents[0].args.rewardedAssets;
      const rewardedAmounts = claimEvents[0].args.rewardedAmounts;
      expect(rewardedAssets.length).to.equal(rewardedAmounts.length);
      for (var i = 0; i < rewardedAssets.length; i++) {
        expect(trackedAssets).to.contains(rewardedAssets[i]);
        expect(rewardedAmounts[i]).to.equal(
          trackedAssetsBalancesBeforeClaim[i].mul(expectedRewardFraction).div(utils.parseEther('1')),
        );
        var trackedAsset = MockToken.attach(trackedAssets[i]);
        expect(await trackedAsset.balanceOf(deployer.address)).to.equal(
          stakeholderBalancesBeforeClaim[i].add(rewardedAmounts[i]),
        );
      }

      const stakeUpdatedAt = (await ethers.provider.getBlock('latest')).timestamp;
      const stakeInfo = await fndzStaking.stakeholderToStakeInfo(deployer.address);
      expect(stakeInfo.stakedAmount).to.equal(stakeAmount);
      expect(stakeInfo.hasEarnedRewards).to.equal(false);
      expect(stakeInfo.stakeUpdatedAt).to.equal(stakeUpdatedAt);
    });

    it('Should be able to claim and stake the claimed FNDZ tokens', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Advancing the time to get some rewards
      const totalDays = 100;
      await advanceTime(totalDays * 24 * 60 * 60);

      // Finding the tracked assets balance before claim
      const trackedAssetsBalancesBeforeClaim = [];
      const trackedAssets = await fndzStaking.getTrackedAssets();
      for (var i = 0; i < trackedAssets.length; i++) {
        trackedAssetsBalancesBeforeClaim.push(await fndzStaking.getRewardBalance(trackedAssets[i]));
      }

      const fndzStaked = await fndzStaking.getStakedAmount(deployer.address);
      const totalFNDZStaked = await fndzStaking.totalFNDZStaked();
      const expectedRewardFraction = fndzStaked.mul(totalDays).mul(utils.parseEther('1')).div(totalFNDZStaked).div(365);

      const swapData = abiCoder.encode(
        ['address[]', 'address[][]', 'uint256[]'],
        [[busdToken.address], [[busdToken.address, fndzToken.address]], [utils.parseEther('10')]],
      );
      const claimTx = await fndzStaking.claimRewardsAndStake(swapData);
      const claimReceipt = await claimTx.wait();
      // Earned Rewards update event
      const rewardsUpdatedEvents = filterEventsByABI(claimReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const earnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const earnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      for (var i = 0; i < earnedAssets.length; i++) {
        var expectedRewardAmount = trackedAssetsBalancesBeforeClaim[i]
          .mul(expectedRewardFraction)
          .div(utils.parseEther('1'));
        expect(earnedAmounts[i]).to.equal(expectedRewardAmount);
        expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(earnedAssets[i])).to.equal(0);
      }
      const assetSwappedEvents = filterEventsByABI(claimReceipt, [assetSwappedEventABI]);
      var swappedFNDZ = BigNumber.from('0');
      for (var i = 0; i < assetSwappedEvents.length; i++) {
        swappedFNDZ = swappedFNDZ.add(assetSwappedEvents[i].args.destinationAmount);
      }
      // Reward Claimed Event
      const claimEvents = filterEventsByABI(claimReceipt, [rewardsClaimedAsFNDZEventABI]);
      expect(claimEvents.length).to.equal(1);
      expect(claimEvents[0].args.stakeholder).to.equal(deployer.address);
      const claimedFNDZ = claimEvents[0].args.claimedFNDZ;
      expect(claimedFNDZ).to.equal(swappedFNDZ);
      const stakedEvents = filterEventsByABI(claimReceipt, [fndzStakedEventABI]);
      expect(stakedEvents.length).to.equal(1);
      expect(stakedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(stakedEvents[0].args.stakedAmount).to.equal(swappedFNDZ);
      const stakeUpdatedAt = (await ethers.provider.getBlock('latest')).timestamp;
      const stakeInfo = await fndzStaking.stakeholderToStakeInfo(deployer.address);
      expect(stakeInfo.stakedAmount).to.equal(stakeAmount.add(swappedFNDZ));
      expect(stakeInfo.hasEarnedRewards).to.equal(false);
      expect(stakeInfo.stakeUpdatedAt).to.equal(stakeUpdatedAt);
    });

    it('Should be able to transfer assets directly if price impact is high when claims as FNDZ and stake', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Adding WBTC rewards to the pool
      await fndzStaking.addTrackedAssets([wbtcToken.address]);

      // Adding rewards to the Pool
      await wbtcToken.mintFor(fndzStaking.address, utils.parseUnits('1000', 8));

      // Advancing the time to get some rewards
      const totalDays = 100;
      await advanceTime(totalDays * 24 * 60 * 60);

      // Finding the tracked assets balance before claim
      const trackedAssetsBalancesBeforeClaim = [];
      const stakeholderBalancesBeforeClaim = [];
      const trackedAssets = await fndzStaking.getTrackedAssets();
      const MockToken = await ethers.getContractFactory('MockToken');
      for (var i = 0; i < trackedAssets.length; i++) {
        trackedAssetsBalancesBeforeClaim.push(await fndzStaking.getRewardBalance(trackedAssets[i]));
        var trackedAsset = MockToken.attach(trackedAssets[i]);
        stakeholderBalancesBeforeClaim.push(await trackedAsset.balanceOf(deployer.address));
      }

      const fndzBalanceBeforeClaim = await fndzToken.balanceOf(deployer.address);
      const fndzStaked = await fndzStaking.getStakedAmount(deployer.address);
      const totalFNDZStaked = await fndzStaking.totalFNDZStaked();
      const expectedRewardFraction = fndzStaked.mul(totalDays).mul(utils.parseEther('1')).div(totalFNDZStaked).div(365);

      const swapData = abiCoder.encode(
        ['address[]', 'address[][]', 'uint256[]'],
        [
          [wbtcToken.address, busdToken.address],
          [
            // Pass empty path for high price impact token(wBTC)
            [],
            [busdToken.address, fndzToken.address],
          ],
          [utils.parseUnits('10', 8), utils.parseEther('10')],
        ],
      );
      const assetsToInclude = [wbtcToken.address, busdToken.address];
      const claimTx = await fndzStaking.claimRewardsAndStake(swapData);
      const claimReceipt = await claimTx.wait();
      // Earned Rewards update event
      const rewardsUpdatedEvents = filterEventsByABI(claimReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const earnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const earnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      for (var i = 0; i < earnedAssets.length; i++) {
        var expectedRewardAmount = trackedAssetsBalancesBeforeClaim[i]
          .mul(expectedRewardFraction)
          .div(utils.parseEther('1'));
        expect(earnedAmounts[i]).to.equal(expectedRewardAmount);
        if (assetsToInclude.includes(earnedAssets[i])) {
          expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(earnedAssets[i])).to.equal(0);
        } else {
          expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(earnedAssets[i])).to.not.equal(0);
        }
      }
      const assetSwappedEvents = filterEventsByABI(claimReceipt, [assetSwappedEventABI]);
      var swappedFNDZ = BigNumber.from('0');
      const swappedAssets = [];
      for (var i = 0; i < assetSwappedEvents.length; i++) {
        swappedFNDZ = swappedFNDZ.add(assetSwappedEvents[i].args.destinationAmount);
        swappedAssets.push(assetSwappedEvents[i].args.sourceAsset);
      }

      // Checking the balance of high price impact tokens if transferred successfully
      for (var i = 0; i < trackedAssets.length; i++) {
        if (assetsToInclude.includes(trackedAssets[i]) && !swappedAssets.includes(trackedAssets[i])) {
          const index = earnedAssets.indexOf(trackedAssets[i]);
          if (index != -1) {
            var trackedAsset = MockToken.attach(trackedAssets[i]);
            expect(await trackedAsset.balanceOf(deployer.address)).to.equal(
              stakeholderBalancesBeforeClaim[i].add(earnedAmounts[index]),
            );
          }
        }
      }

      // Reward Claimed Event
      const claimEvents = filterEventsByABI(claimReceipt, [rewardsClaimedAsFNDZEventABI]);
      expect(claimEvents.length).to.equal(1);
      expect(claimEvents[0].args.stakeholder).to.equal(deployer.address);

      const claimedFNDZ = claimEvents[0].args.claimedFNDZ;

      expect(claimedFNDZ).to.equal(swappedFNDZ);
      expect(await fndzToken.balanceOf(fndzStaking.address)).to.equal(totalFNDZStaked.add(swappedFNDZ));
      expect(await fndzToken.balanceOf(deployer.address)).to.equal(fndzBalanceBeforeClaim);
      const stakeUpdatedAt = (await ethers.provider.getBlock('latest')).timestamp;
      const stakeInfo = await fndzStaking.stakeholderToStakeInfo(deployer.address);
      expect(stakeInfo.stakedAmount).to.equal(stakeAmount.add(swappedFNDZ));
      expect(stakeInfo.hasEarnedRewards).to.equal(false);
      expect(stakeInfo.stakeUpdatedAt).to.equal(stakeUpdatedAt);
    });

    it('Can not initiate claim if no rewards were applicable', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      await expect(fndzStaking.claimRewards([])).to.revertedWith('No rewards earned');
    });

    it('Should provide the complete rewards if all the stakers has staked for an year then claimed and withdrawn the FNDZ', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      const user1 = deployer;
      await fndzToken.connect(user1).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user1).stakeFNDZ(stakeAmount);
      const user2 = accounts[1];
      await fndzToken.connect(user2).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user2).stakeFNDZ(stakeAmount);
      const user3 = accounts[2];
      await fndzToken.connect(user3).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user3).stakeFNDZ(stakeAmount);

      // Advancing the time to complete an year
      const totalDays = 365;
      await advanceTime(totalDays * 24 * 60 * 60);

      // User 1 claims and withdraw
      let claimTx = await fndzStaking.connect(user1).claimRewards([]);
      await claimTx.wait();
      let stakeUpdatedAt = (await ethers.provider.getBlock('latest')).timestamp;
      let stakeInfo = await fndzStaking.stakeholderToStakeInfo(user1.address);
      expect(stakeInfo.stakedAmount).to.equal(stakeAmount);
      expect(stakeInfo.hasEarnedRewards).to.equal(false);
      expect(stakeInfo.stakeUpdatedAt).to.equal(stakeUpdatedAt);
      // Withdrawn the tokens
      await fndzStaking.connect(user1).withdrawFNDZ(stakeAmount);

      // User 2 claims and withdraw
      claimTx = await fndzStaking.connect(user2).claimRewards([]);
      await claimTx.wait();
      stakeUpdatedAt = (await ethers.provider.getBlock('latest')).timestamp;
      stakeInfo = await fndzStaking.stakeholderToStakeInfo(user2.address);
      expect(stakeInfo.stakedAmount).to.equal(stakeAmount);
      expect(stakeInfo.hasEarnedRewards).to.equal(false);
      expect(stakeInfo.stakeUpdatedAt).to.equal(stakeUpdatedAt);
      // Withdrawn the tokens
      await fndzStaking.connect(user2).withdrawFNDZ(stakeAmount);

      // User 3 claims and withdraw
      claimTx = await fndzStaking.connect(user3).claimRewards([]);
      await claimTx.wait();
      stakeUpdatedAt = (await ethers.provider.getBlock('latest')).timestamp;
      stakeInfo = await fndzStaking.stakeholderToStakeInfo(user3.address);
      expect(stakeInfo.stakedAmount).to.equal(stakeAmount);
      expect(stakeInfo.hasEarnedRewards).to.equal(false);
      expect(stakeInfo.stakeUpdatedAt).to.equal(stakeUpdatedAt);
      // Withdrawn the tokens
      await fndzStaking.connect(user3).withdrawFNDZ(stakeAmount);

      const trackedAssets = await fndzStaking.getTrackedAssets();
      for (var i = 0; i < trackedAssets.length; i++) {
        expect(await fndzStaking.getRewardBalance(trackedAssets[i])).to.equal(0);
      }
      expect(await fndzStaking.totalFNDZStaked()).to.equal(0);
    });

    it('Reward calculation verification with example scenario', async function () {
      // @scenario - Five user staking at the same day
      // Each user claims and withdraw their FNDZ on different day

      const stakeAmount = utils.parseEther('1000');
      const user1 = accounts[1];
      await fndzToken.connect(user1).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user1).stakeFNDZ(stakeAmount);
      const user2 = accounts[2];
      await fndzToken.connect(user2).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user2).stakeFNDZ(stakeAmount);
      const user3 = accounts[3];
      await fndzToken.connect(user3).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user3).stakeFNDZ(stakeAmount);
      const user4 = accounts[4];
      await fndzToken.connect(user4).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user4).stakeFNDZ(stakeAmount);
      const user5 = accounts[5];
      await fndzToken.connect(user5).approve(fndzStaking.address, stakeAmount);
      await fndzStaking.connect(user5).stakeFNDZ(stakeAmount);

      // Claim test cases
      const testCases = [
        {
          user: user1,
          days: 10,
          rewardedAmount: BigNumber.from('5479452054794520000'),
        },
        {
          user: user2,
          days: 50,
          rewardedAmount: BigNumber.from('27247138299868642551'),
        },
        {
          user: user3,
          days: 90,
          rewardedAmount: BigNumber.from('47701154448263185603'),
        },
        {
          user: user4,
          days: 165,
          rewardedAmount: BigNumber.from('83139409373982001361'),
        },
        {
          user: user5,
          days: 320,
          rewardedAmount: BigNumber.from('146662197623774973884'),
        },
      ];

      const trackedAssets = await fndzStaking.getTrackedAssets();
      let daysPassed = 0;
      for (var i = 0; i < testCases.length; i++) {
        // Advancing the time to expected days
        const days = testCases[i].days;
        await advanceTime((days - daysPassed) * 24 * 60 * 60);
        daysPassed = days;

        const stakeholder = testCases[i].user;
        const fndzBalanceBeforeClaim = await fndzToken.balanceOf(stakeholder.address);
        const rewardedAmount = testCases[i].rewardedAmount;

        const swapData = abiCoder.encode(
          ['address[]', 'address[][]', 'uint256[]'],
          [[busdToken.address], [[busdToken.address, fndzToken.address]], [utils.parseEther('10')]],
        );
        const claimTx = await fndzStaking.connect(stakeholder).claimRewardsAsFNDZ(swapData);
        const claimReceipt = await claimTx.wait();
        // Earned Rewards update event
        const rewardsUpdatedEvents = filterEventsByABI(claimReceipt, [earnedFNDZUpdatedEventABI]);
        expect(rewardsUpdatedEvents.length).to.equal(1);
        expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(stakeholder.address);
        expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
        const earnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
        const earnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
        for (var j = 0; j < earnedAssets.length; j++) {
          expect(earnedAmounts[j]).to.equal(rewardedAmount);
          expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(earnedAssets[j])).to.equal(0);
        }
        const assetSwappedEvents = filterEventsByABI(claimReceipt, [assetSwappedEventABI]);
        var swappedFNDZ = BigNumber.from('0');
        for (var j = 0; j < assetSwappedEvents.length; j++) {
          swappedFNDZ = swappedFNDZ.add(assetSwappedEvents[j].args.destinationAmount);
        }
        // Reward Claimed Event
        const claimEvents = filterEventsByABI(claimReceipt, [rewardsClaimedAsFNDZEventABI]);
        expect(claimEvents.length).to.equal(1);
        expect(claimEvents[0].args.stakeholder).to.equal(stakeholder.address);
        const claimedFNDZ = claimEvents[0].args.claimedFNDZ;
        expect(claimedFNDZ).to.equal(swappedFNDZ);
        expect(await fndzToken.balanceOf(stakeholder.address)).to.equal(fndzBalanceBeforeClaim.add(swappedFNDZ));
      }
    });

    it('Claim rewards when pool has maximum no. of tracked assets', async function () {
      // removing BUSD to have a clean set of 100 assets
      await fndzStaking.removeTrackedAssets([busdToken.address]);

      const totalAssets = 100;
      const assetAddresses = [];
      const swapPaths = [];
      const minimumAmounts = [];
      const aggregators = [];
      const rateAssets = [];
      // Creating and minting 100 assets
      const MockToken = await ethers.getContractFactory('MockToken', deployer);
      const TokenToFNDZPair = await ethers.getContractFactory('MockUniswapV2Pair', deployer);
      for (var i = 0; i < totalAssets; i++) {
        const tokenName = 'Token' + i;
        var mockToken = await MockToken.deploy(tokenName, tokenName.toUpperCase(), 18);
        await mockToken.deployed();

        // Minting rewards to Staking contracts
        const mintTx = await mockToken.mintFor(fndzStaking.address, utils.parseEther('1'));
        await mintTx.wait();

        // Uniswap pair creation and registering
        // MockToken to FNDZ Pair
        const tokenToFNDZPair = await TokenToFNDZPair.deploy(
          mockToken.address,
          fndzToken.address,
          utils.parseEther('1000'),
          utils.parseEther('1000'),
          BigNumber.from('1000'),
        );
        const MockUniswapV2Factory = await hre.ethers.getContractFactory('MockUniswapV2Factory', deployer);
        const mockUniswapV2Factory = MockUniswapV2Factory.attach(contracts.MockUniswapV2Factory);
        const registerTx = await mockUniswapV2Factory.registerPair(
          mockToken.address,
          fndzToken.address,
          tokenToFNDZPair.address,
        );
        await registerTx.wait();

        assetAddresses.push(mockToken.address);
        swapPaths.push([mockToken.address, fndzToken.address]);
        minimumAmounts.push(utils.parseEther('1'));
        aggregators.push(contracts.mockContracts.MockChainlinkAggregator);
        rateAssets.push(0);
      }

      // Configuring ChainlinkPriceFeed
      const ChainlinkPriceFeed = await ethers.getContractFactory('ChainlinkPriceFeed', deployer);
      const chainlinkPriceFeed = ChainlinkPriceFeed.attach(contracts.ChainlinkPriceFeed);
      const addPrimitivesTx = await chainlinkPriceFeed.addPrimitives(assetAddresses, aggregators, rateAssets);
      await addPrimitivesTx.wait();

      // Adding These assets as tracked assets in staking contract
      const addTrackedAssetsTx = await fndzStaking.addTrackedAssets(assetAddresses);
      await addTrackedAssetsTx.wait();

      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Advancing the time to get some rewards
      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);

      // Claiming the Rewards as FNDZ Tokens
      const swapData = abiCoder.encode(
        ['address[]', 'address[][]', 'uint256[]'],
        [assetAddresses, swapPaths, minimumAmounts],
      );
      const claimAsFNDZTx = await fndzStaking.claimRewardsAsFNDZ(swapData);
      const claimAsFNDZReceipt = await claimAsFNDZTx.wait();
      let assetSwappedEvents = filterEventsByABI(claimAsFNDZReceipt, [assetSwappedEventABI]);
      expect(assetSwappedEvents.length).to.equal(totalAssets);

      // Staking FNDZ
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Advancing the time to get some rewards
      await advanceTime(totalDays * 24 * 60 * 60);

      const fndzStaked = await fndzStaking.getStakedAmount(deployer.address);
      const totalFNDZStaked = await fndzStaking.totalFNDZStaked();
      const expectedRewardFraction = fndzStaked.mul(totalDays).mul(utils.parseEther('1')).div(totalFNDZStaked).div(365);

      // Finding the tracked assets balance before claim
      const trackedAssetsBalancesBeforeClaim = [];
      const stakeholderBalancesBeforeClaim = [];
      const trackedAssets = await fndzStaking.getTrackedAssets();
      for (var i = 0; i < trackedAssets.length; i++) {
        trackedAssetsBalancesBeforeClaim.push(await fndzStaking.getRewardBalance(trackedAssets[i]));
        var trackedAsset = MockToken.attach(trackedAssets[i]);
        stakeholderBalancesBeforeClaim.push(await trackedAsset.balanceOf(deployer.address));
      }

      // Claiming the Rewards as underlying Tokens
      const claimAsAssetsTx = await fndzStaking.claimRewards([]);
      const claimAsAssetsReceipt = await claimAsAssetsTx.wait();

      // Reward Claimed Event
      const claimEvents = filterEventsByABI(claimAsAssetsReceipt, [rewardsClaimedAsTrackedAssetsEventABI]);
      expect(claimEvents.length).to.equal(1);
      expect(claimEvents[0].args.stakeholder).to.equal(deployer.address);
      const rewardedAssets = claimEvents[0].args.rewardedAssets;
      const rewardedAmounts = claimEvents[0].args.rewardedAmounts;
      expect(rewardedAssets.length).to.equal(rewardedAmounts.length);
      for (var i = 0; i < rewardedAssets.length; i++) {
        expect(trackedAssets).to.contains(rewardedAssets[i]);
        expect(rewardedAmounts[i]).to.equal(
          trackedAssetsBalancesBeforeClaim[i].mul(expectedRewardFraction).div(utils.parseEther('1')),
        );
        var trackedAsset = MockToken.attach(trackedAssets[i]);
        expect(await trackedAsset.balanceOf(deployer.address)).to.equal(
          stakeholderBalancesBeforeClaim[i].add(rewardedAmounts[i]),
        );
      }

      // Staking FNDZ
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Advancing the time to get some rewards
      await advanceTime(totalDays * 24 * 60 * 60);

      // Claiming and Restaking the Rewards
      const claimAndStakeTx = await fndzStaking.claimRewardsAndStake(swapData);
      const claimAndStakeReceipt = await claimAndStakeTx.wait();
      assetSwappedEvents = filterEventsByABI(claimAndStakeReceipt, [assetSwappedEventABI]);
      expect(assetSwappedEvents.length).to.equal(totalAssets);
    });

    it('Should be able to claim the earned rewards after withdrawing all the stakes', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Advancing the time to get some rewards
      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);

      // Finding the tracked assets balance before claim
      const trackedAssetsBalancesBeforeClaim = [];
      const trackedAssets = await fndzStaking.getTrackedAssets();
      for (var i = 0; i < trackedAssets.length; i++) {
        trackedAssetsBalancesBeforeClaim.push(await fndzStaking.getRewardBalance(trackedAssets[i]));
      }
      const fndzStaked = await fndzStaking.getStakedAmount(deployer.address);
      const totalFNDZStaked = await fndzStaking.totalFNDZStaked();
      const expectedRewardFraction = fndzStaked.mul(totalDays).mul(utils.parseEther('1')).div(totalFNDZStaked).div(365);

      const withdrawTx = await fndzStaking.withdrawFNDZ(stakeAmount);
      const withdrawReceipt = await withdrawTx.wait();
      let rewardsUpdatedEvents = filterEventsByABI(withdrawReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const earnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const earnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      const earnedRewards = await fndzStaking.getClaimableRewards(deployer.address);
      for (var i = 0; i < earnedAssets.length; i++) {
        expect(earnedRewards[0][i]).to.equal(earnedAssets[i]);
        expect(earnedRewards[1][i]).to.equal(earnedAmounts[i]);
        expect(earnedAmounts[i]).to.equal(
          trackedAssetsBalancesBeforeClaim[i].mul(expectedRewardFraction).div(utils.parseEther('1')),
        );
      }

      const claimTx = await fndzStaking.claimRewards([]);
      const claimReceipt = await claimTx.wait();
      rewardsUpdatedEvents = filterEventsByABI(claimReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(0);
      // Reward Claimed Event
      const claimEvents = filterEventsByABI(claimReceipt, [rewardsClaimedAsTrackedAssetsEventABI]);
      expect(claimEvents.length).to.equal(1);
      expect(claimEvents[0].args.stakeholder).to.equal(deployer.address);
      const rewardedAssets = claimEvents[0].args.rewardedAssets;
      const rewardedAmounts = claimEvents[0].args.rewardedAmounts;
      expect(rewardedAssets.length).to.equal(rewardedAmounts.length);
      for (var i = 0; i < rewardedAssets.length; i++) {
        expect(rewardedAmounts[i]).to.equal(earnedAmounts[i]);
      }
    });

    it('Should be able to claim the earned rewards after unstaking all the stakes', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Advancing the time to get some rewards
      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);

      // Finding the tracked assets balance before claim
      const trackedAssetsBalancesBeforeClaim = [];
      const trackedAssets = await fndzStaking.getTrackedAssets();
      for (var i = 0; i < trackedAssets.length; i++) {
        trackedAssetsBalancesBeforeClaim.push(await fndzStaking.getRewardBalance(trackedAssets[i]));
      }
      const fndzStaked = await fndzStaking.getStakedAmount(deployer.address);
      const totalFNDZStaked = await fndzStaking.totalFNDZStaked();
      const expectedRewardFraction = fndzStaked.mul(totalDays).mul(utils.parseEther('1')).div(totalFNDZStaked).div(365);

      const unstakeTx = await fndzStaking.unstakeFNDZ(stakeAmount);
      const unstakeReceipt = await unstakeTx.wait();
      let rewardsUpdatedEvents = filterEventsByABI(unstakeReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const earnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const earnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      const earnedRewards = await fndzStaking.getClaimableRewards(deployer.address);
      for (var i = 0; i < earnedAssets.length; i++) {
        expect(earnedRewards[0][i]).to.equal(earnedAssets[i]);
        expect(earnedRewards[1][i]).to.equal(earnedAmounts[i]);
        expect(earnedAmounts[i]).to.equal(
          trackedAssetsBalancesBeforeClaim[i].mul(expectedRewardFraction).div(utils.parseEther('1')),
        );
      }

      const claimTx = await fndzStaking.claimRewards([]);
      const claimReceipt = await claimTx.wait();
      rewardsUpdatedEvents = filterEventsByABI(claimReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(0);
      // Reward Claimed Event
      const claimEvents = filterEventsByABI(claimReceipt, [rewardsClaimedAsTrackedAssetsEventABI]);
      expect(claimEvents.length).to.equal(1);
      expect(claimEvents[0].args.stakeholder).to.equal(deployer.address);
      const rewardedAssets = claimEvents[0].args.rewardedAssets;
      const rewardedAmounts = claimEvents[0].args.rewardedAmounts;
      expect(rewardedAssets.length).to.equal(rewardedAmounts.length);
      for (var i = 0; i < rewardedAssets.length; i++) {
        expect(rewardedAmounts[i]).to.equal(earnedAmounts[i]);
      }
    });

    it('Should revert if invalid swap path is passed', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Advancing the time to get some rewards
      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);

      const swapData = abiCoder.encode(
        ['address[]', 'address[][]', 'uint256[]'],
        [[busdToken.address], [[busdToken.address, usdcToken.address]], [utils.parseEther('10')]],
      );
      await expect(fndzStaking.claimRewardsAsFNDZ(swapData)).to.revertedWith(
        'last element of _swapPath must be _destinationAsset',
      );
    });

    it('Should revert if invalid assets to include is passed', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Advancing the time to get some rewards
      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);

      const swapData = abiCoder.encode(
        ['address[]', 'address[][]', 'uint256[]'],
        [
          [wbtcToken.address, busdToken.address],
          [
            [wbtcToken.address, usdcToken.address, fndzToken.address],
            [busdToken.address, usdcToken.address],
          ],
          [utils.parseUnits('10', 8), utils.parseEther('10')],
        ],
      );
      await expect(fndzStaking.claimRewardsAsFNDZ(swapData)).to.revertedWith(
        'assetsToInclude must be a subset of trackedAssets',
      );
    });

    it('Should be able to skip assets on claim', async function () {
      // adding more tracked asset
      await daiToken.mintFor(fndzStaking.address, utils.parseEther('1'));
      await fndzStaking.addTrackedAssets([daiToken.address]);
      expect(await fndzStaking.getTrackedAssets()).to.deep.equal([busdToken.address, daiToken.address]);

      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Claiming Rewards as Tracked Assets
      // Advancing the time to get some rewards
      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);

      // Pausing a token to make the claim fail
      await busdToken.pause();
      await expect(fndzStaking.claimRewards([])).to.revertedWith('paused');

      let claimTx = await fndzStaking.claimRewards([busdToken.address]);
      let claimReceipt = await claimTx.wait();

      // Reward Claimed Event
      let claimEvents = filterEventsByABI(claimReceipt, [rewardsClaimedAsTrackedAssetsEventABI]);
      expect(claimEvents.length).to.equal(1);
      expect(claimEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(claimEvents[0].args.rewardedAssets.length).to.equal(1);
      expect(claimEvents[0].args.rewardedAssets).to.deep.equal([daiToken.address]);

      // assetsToSkip should be unique
      await expect(fndzStaking.claimRewards([fndzToken.address, fndzToken.address])).to.revertedWith(
        'claimRewards: __assetsToSkip contains duplicates',
      );
      // can not skip all the tracked assets
      await expect(fndzStaking.claimRewards(await fndzStaking.getTrackedAssets())).to.revertedWith(
        'claimRewards: no payout to claim',
      );

      // mint more rewards for staking contract
      await daiToken.mintFor(fndzStaking.address, utils.parseEther('10'));

      // Claiming Rewards as FNDZ
      // Advancing the time to get some rewards
      await advanceTime(totalDays * 24 * 60 * 60);

      // Include paused token to claim
      let swapData = abiCoder.encode(
        ['address[]', 'address[][]', 'uint256[]'],
        [[busdToken.address], [[busdToken.address, fndzToken.address]], [utils.parseEther('10')]],
      );
      await expect(fndzStaking.claimRewardsAsFNDZ(swapData)).to.revertedWith('paused');

      swapData = abiCoder.encode(
        ['address[]', 'address[][]', 'uint256[]'],
        [[daiToken.address], [[daiToken.address, fndzToken.address]], [utils.parseEther('1')]],
      );
      claimTx = await fndzStaking.claimRewardsAsFNDZ(swapData);
      claimReceipt = await claimTx.wait();

      // Reward Claimed Event
      claimEvents = filterEventsByABI(claimReceipt, [rewardsClaimedAsFNDZEventABI]);
      expect(claimEvents.length).to.equal(1);
      expect(claimEvents[0].args.stakeholder).to.equal(deployer.address);

      // assetsToInclude should be unique
      swapData = abiCoder.encode(
        ['address[]', 'address[][]', 'uint256[]'],
        [
          [daiToken.address, daiToken.address],
          [
            [daiToken.address, fndzToken.address],
            [daiToken.address, fndzToken.address],
          ],
          [utils.parseEther('1'), utils.parseEther('1')],
        ],
      );

      await expect(fndzStaking.claimRewardsAsFNDZ(swapData)).to.revertedWith(
        'claimRewardsAsFNDZ: assetsToInclude must not contain duplicates',
      );

      // must include 1 token to claim
      swapData = abiCoder.encode(['address[]', 'address[][]', 'uint256[]'], [[], [], []]);

      await expect(fndzStaking.claimRewardsAsFNDZ(swapData)).to.revertedWith('claimRewardsAsFNDZ: no payout to claim');

      // length should be same for all arrays
      swapData = abiCoder.encode(
        ['address[]', 'address[][]', 'uint256[]'],
        [[daiToken.address, wbtcToken.address], [[daiToken.address, fndzToken.address]], [utils.parseEther('1')]],
      );

      await expect(fndzStaking.claimRewardsAsFNDZ(swapData)).to.revertedWith(
        'length must match minimumFndzAmounts length',
      );
    });

    it('Should not change the rewards amount even the user unstake first and then claim', async function () {
      // Staking FNDZ
      const stakeAmount = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeAmount);
      await fndzStaking.stakeFNDZ(stakeAmount);

      // Advancing the time to get some rewards
      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);

      const fndzStaked = await fndzStaking.getStakedAmount(deployer.address);
      const totalFNDZStaked = await fndzStaking.totalFNDZStaked();
      const expectedRewardFraction = fndzStaked.mul(totalDays).mul(utils.parseEther('1')).div(totalFNDZStaked).div(365);
      // Finding the tracked assets balance before
      const trackedAssetsBalancesBefore = [];
      const trackedAssets = await fndzStaking.getTrackedAssets();
      for (var i = 0; i < trackedAssets.length; i++) {
        trackedAssetsBalancesBefore.push(await fndzStaking.getRewardBalance(trackedAssets[i]));
      }

      // Unstaking
      const unstakeTx = await fndzStaking.unstakeFNDZ(stakeAmount);
      const unstakeReceipt = await unstakeTx.wait();
      const rewardsUpdatedEvents = filterEventsByABI(unstakeReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const earnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const earnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      expect(earnedAssets).to.deep.equal(trackedAssets);
      for (var i = 0; i < earnedAssets.length; i++) {
        expect(earnedAmounts[i]).to.equal(
          trackedAssetsBalancesBefore[i].mul(expectedRewardFraction).div(utils.parseEther('1')),
        );
      }

      // Claiming rewards
      const claimTx = await fndzStaking.claimRewards([]);
      const claimReceipt = await claimTx.wait();
      // Reward Claimed Event
      const claimEvents = filterEventsByABI(claimReceipt, [rewardsClaimedAsTrackedAssetsEventABI]);
      expect(claimEvents.length).to.equal(1);
      expect(claimEvents[0].args.stakeholder).to.equal(deployer.address);
      const rewardedAssets = claimEvents[0].args.rewardedAssets;
      const rewardedAmounts = claimEvents[0].args.rewardedAmounts;
      expect(rewardedAssets.length).to.equal(rewardedAmounts.length);
      expect(earnedAssets).to.deep.equal(rewardedAssets);
      for (var i = 0; i < rewardedAssets.length; i++) {
        expect(rewardedAmounts[i]).to.equal(earnedAmounts[i]);
      }
    });
  });

  describe('State variables & calculation Tests', async function () {
    it('getRewardBalance should return only the rewardable tracked asset balance', async function () {
      const fndzRewards = utils.parseEther('1000');
      await fndzToken.mintFor(fndzStaking.address, fndzRewards);

      // only the tracked assets will be taken into account
      expect(await fndzStaking.getRewardBalance(fndzToken.address)).to.equal(0);

      // Updating the tracked assets
      await fndzStaking.addTrackedAssets([fndzToken.address]);
      expect(await fndzStaking.getRewardBalance(fndzToken.address)).to.equal(fndzRewards);

      // Should differentiate the staked and rewardable FNDZ tokens
      const stakeFNDZ = utils.parseEther('1000');
      // Staking FNDZ
      await fndzToken.approve(fndzStaking.address, stakeFNDZ);
      await fndzStaking.stakeFNDZ(stakeFNDZ);
      expect(await fndzToken.balanceOf(fndzStaking.address)).to.equal(fndzRewards.add(stakeFNDZ));
      expect(await fndzStaking.getRewardBalance(fndzToken.address)).to.equal(fndzRewards);

      // Advancing the time to get some rewards
      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);

      // Finding the tracked assets balance before claim
      const trackedAssetsBalancesBeforeUpdate = [];
      const trackedAssets = await fndzStaking.getTrackedAssets();
      for (var i = 0; i < trackedAssets.length; i++) {
        trackedAssetsBalancesBeforeUpdate.push(await fndzStaking.getRewardBalance(trackedAssets[i]));
      }

      // Should exclude the rewards allocated
      await fndzToken.approve(fndzStaking.address, stakeFNDZ);
      const stakeTx = await fndzStaking.stakeFNDZ(stakeFNDZ);
      const stakeReceipt = await stakeTx.wait();
      const rewardsUpdatedEvents = filterEventsByABI(stakeReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const earnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const earnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      for (var i = 0; i < earnedAssets.length; i++) {
        expect(await fndzStaking.getRewardBalance(trackedAssets[i])).to.equal(
          trackedAssetsBalancesBeforeUpdate[i].sub(earnedAmounts[i]),
        );
      }
    });

    it('Should allocate the earned rewards properly', async function () {
      const user1 = accounts[1];
      const user2 = accounts[2];
      const stakeFNDZ = utils.parseEther('1000');

      // User1 staking
      await fndzToken.connect(user1).approve(fndzStaking.address, stakeFNDZ);
      await fndzStaking.connect(user1).stakeFNDZ(stakeFNDZ);
      // User2 staking
      await fndzToken.connect(user2).approve(fndzStaking.address, stakeFNDZ);
      await fndzStaking.connect(user2).stakeFNDZ(stakeFNDZ);

      // Advancing the time to get some rewards
      const totalDays = 1;
      await advanceTime(totalDays * 24 * 60 * 60);
      const trackedAssets = await fndzStaking.getTrackedAssets();

      // User1 staking again - updates the earned rewards
      await fndzToken.connect(user1).approve(fndzStaking.address, stakeFNDZ);
      let stakeTx = await fndzStaking.connect(user1).stakeFNDZ(stakeFNDZ);
      let stakeReceipt = await stakeTx.wait();
      let rewardsUpdatedEvents = filterEventsByABI(stakeReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(user1.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const user1EarnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const user1EarnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      let user1RewardsEarned = await fndzStaking.getClaimableRewards(user1.address);
      for (var i = 0; i < user1EarnedAssets.length; i++) {
        expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(trackedAssets[i])).to.equal(
          user1EarnedAmounts[i],
        );
        expect(user1RewardsEarned[0][i]).to.equal(user1EarnedAssets[i]);
        expect(user1RewardsEarned[1][i]).to.equal(user1EarnedAmounts[i]);
      }

      // User2 staking again - updates the earned rewards
      await fndzToken.connect(user2).approve(fndzStaking.address, stakeFNDZ);
      stakeTx = await fndzStaking.connect(user2).stakeFNDZ(stakeFNDZ);
      stakeReceipt = await stakeTx.wait();
      rewardsUpdatedEvents = filterEventsByABI(stakeReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(user2.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const user2EarnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const user2EarnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      let user2RewardsEarned = await fndzStaking.getClaimableRewards(user2.address);
      for (var i = 0; i < user2EarnedAssets.length; i++) {
        expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(trackedAssets[i])).to.equal(
          user2EarnedAmounts[i].add(user1EarnedAmounts[i]),
        );
        expect(user2RewardsEarned[0][i]).to.equal(user2EarnedAssets[i]);
        expect(user2RewardsEarned[1][i]).to.equal(user2EarnedAmounts[i]);
      }

      // User1 caliming the allocated rewards
      let claimTx = await fndzStaking.connect(user1).claimRewards([]);
      let claimReceipt = await claimTx.wait();
      // Reward Claimed Event
      let claimEvents = filterEventsByABI(claimReceipt, [rewardsClaimedAsTrackedAssetsEventABI]);
      expect(claimEvents.length).to.equal(1);
      expect(claimEvents[0].args.stakeholder).to.equal(user1.address);
      const user1RewardedAssets = claimEvents[0].args.rewardedAssets;
      const user1RewardedAmounts = claimEvents[0].args.rewardedAmounts;
      expect(user1RewardedAssets.length).to.equal(user1RewardedAmounts.length);
      expect(user1RewardedAssets).to.deep.equal(trackedAssets);
      user1RewardsEarned = await fndzStaking.getClaimableRewards(user1.address);
      for (var i = 0; i < user1RewardedAssets.length; i++) {
        expect(user1EarnedAssets[i]).to.equal(user1RewardedAssets[i]);
        expect(user1EarnedAmounts[i]).to.equal(user1RewardedAmounts[i]);
        expect(user1RewardsEarned[0][i]).to.equal(user1EarnedAssets[i]);
        expect(user1RewardsEarned[1][i]).to.equal(0);
        expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(trackedAssets[i])).to.equal(
          user2EarnedAmounts[i],
        );
      }

      // User2 caliming the allocated rewards
      claimTx = await fndzStaking.connect(user2).claimRewards([]);
      claimReceipt = await claimTx.wait();
      // Reward Claimed Event
      claimEvents = filterEventsByABI(claimReceipt, [rewardsClaimedAsTrackedAssetsEventABI]);
      expect(claimEvents.length).to.equal(1);
      expect(claimEvents[0].args.stakeholder).to.equal(user2.address);
      const user2RewardedAssets = claimEvents[0].args.rewardedAssets;
      const user2RewardedAmounts = claimEvents[0].args.rewardedAmounts;
      expect(user2RewardedAssets.length).to.equal(user2RewardedAmounts.length);
      expect(user2RewardedAssets).to.deep.equal(trackedAssets);
      user2RewardsEarned = await fndzStaking.getClaimableRewards(user2.address);
      for (var i = 0; i < user2RewardedAssets.length; i++) {
        expect(user2EarnedAssets[i]).to.equal(user2RewardedAssets[i]);
        expect(user2EarnedAmounts[i]).to.equal(user2RewardedAmounts[i]);
        expect(user2RewardsEarned[0][i]).to.equal(user2EarnedAssets[i]);
        expect(user2RewardsEarned[1][i]).to.equal(0);
        expect(await fndzStaking.trackedAssetToTotalAllocatedRewardAmount(trackedAssets[i])).to.equal(0);
      }
    });

    it('Should be able to get the current rewards applicable for the user', async function () {
      // User1 staking
      const stakeFNDZ = utils.parseEther('1000');
      await fndzToken.approve(fndzStaking.address, stakeFNDZ);
      await fndzStaking.stakeFNDZ(stakeFNDZ);

      // Finding the tracked assets balance before
      const totalFNDZStaked = await fndzStaking.totalFNDZStaked();
      const trackedAssetsBalancesBefore = [];
      const trackedAssets = await fndzStaking.getTrackedAssets();
      for (var i = 0; i < trackedAssets.length; i++) {
        trackedAssetsBalancesBefore.push(await fndzStaking.getRewardBalance(trackedAssets[i]));
      }

      // Advancing the time to get some rewards - 1 Day from staking
      await advanceTime(1 * 24 * 60 * 60);
      await ethers.provider.send('evm_mine');

      let expectedRewardFraction = stakeFNDZ.mul(1).mul(utils.parseEther('1')).div(totalFNDZStaked).div(365);
      let rewardsEarned = await fndzStaking.getClaimableRewards(deployer.address);
      for (var i = 0; i < trackedAssets.length; i++) {
        const expectedRewardAmount = trackedAssetsBalancesBefore[i]
          .mul(expectedRewardFraction)
          .div(utils.parseEther('1'));
        expect(rewardsEarned[0][i]).to.equal(trackedAssets[i]);
        expect(rewardsEarned[1][i]).to.equal(expectedRewardAmount);
      }

      // Advancing the time to get some rewards - 2 Days from staking
      await advanceTime(1 * 24 * 60 * 60);
      await ethers.provider.send('evm_mine');

      expectedRewardFraction = stakeFNDZ.mul(2).mul(utils.parseEther('1')).div(totalFNDZStaked).div(365);
      rewardsEarned = await fndzStaking.getClaimableRewards(deployer.address);
      for (var i = 0; i < trackedAssets.length; i++) {
        const expectedRewardAmount = trackedAssetsBalancesBefore[i]
          .mul(expectedRewardFraction)
          .div(utils.parseEther('1'));
        expect(rewardsEarned[0][i]).to.equal(trackedAssets[i]);
        expect(rewardsEarned[1][i]).to.equal(expectedRewardAmount);
      }

      const claimTx = await fndzStaking.claimRewards([]);
      const claimReceipt = await claimTx.wait();
      // Earned Rewards update event
      const rewardsUpdatedEvents = filterEventsByABI(claimReceipt, [earnedFNDZUpdatedEventABI]);
      expect(rewardsUpdatedEvents.length).to.equal(1);
      expect(rewardsUpdatedEvents[0].args.stakeholder).to.equal(deployer.address);
      expect(rewardsUpdatedEvents[0].args.earnedAssets).to.deep.equal(trackedAssets);
      const earnedAssets = rewardsUpdatedEvents[0].args.earnedAssets;
      const earnedAmounts = rewardsUpdatedEvents[0].args.earnedAmounts;
      for (var i = 0; i < earnedAssets.length; i++) {
        expect(earnedAmounts[i]).to.equal(rewardsEarned[1][i]);
      }

      // Reward Claimed Event
      const claimEvents = filterEventsByABI(claimReceipt, [rewardsClaimedAsTrackedAssetsEventABI]);
      expect(claimEvents.length).to.equal(1);
      expect(claimEvents[0].args.stakeholder).to.equal(deployer.address);
      const rewardedAssets = claimEvents[0].args.rewardedAssets;
      const rewardedAmounts = claimEvents[0].args.rewardedAmounts;
      expect(rewardedAssets.length).to.equal(rewardedAmounts.length);
      for (var i = 0; i < rewardedAssets.length; i++) {
        expect(rewardedAmounts[i]).to.equal(rewardsEarned[1][i]);
      }
    });

    it('Should be able to add tracked assets', async function () {
      const addTx = await fndzStaking.addTrackedAssets([contracts.mockTokens.MockUSDC, contracts.mockTokens.MockDai]);
      const addReceipt = await addTx.wait();

      const addedEvents = filterEventsByABI(addReceipt, [addedTrackedAssetsEventABI]);
      // Added two assets so
      expect(addedEvents.length).to.equal(2);
      expect(addedEvents[0].args.asset).to.equal(contracts.mockTokens.MockUSDC);
      expect(addedEvents[1].args.asset).to.equal(contracts.mockTokens.MockDai);
    });

    it('Only the owner can add the tracked assets', async function () {
      await expect(
        fndzStaking
          .connect(accounts[1])
          .addTrackedAssets([contracts.mockTokens.MockUSDC, contracts.mockTokens.MockDai]),
      ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('can not add duplicates', async function () {
      // Added mockDai to trackedAssets
      await fndzStaking.addTrackedAssets([contracts.mockTokens.MockDai]);

      // Trying to add again
      await expect(fndzStaking.addTrackedAssets([contracts.mockTokens.MockDai])).to.revertedWith(
        'one of the asset is already a tracked asset',
      );
    });

    it('Should be able to remove the added tracked assets', async function () {
      await fndzStaking.addTrackedAssets([contracts.mockTokens.MockUSDC, contracts.mockTokens.MockDai]);
      // Added MockUSDC and MockDai to the tracked assets

      const removeTx = await fndzStaking.removeTrackedAssets([
        contracts.mockTokens.MockUSDC,
        contracts.mockTokens.MockDai,
      ]);
      const removeReceipt = await removeTx.wait();

      const removedEvents = filterEventsByABI(removeReceipt, [removedTrackedAssetsEventABI]);
      // Added two assets so
      expect(removedEvents.length).to.equal(2);
      expect(removedEvents[0].args.asset).to.equal(contracts.mockTokens.MockUSDC);
      expect(removedEvents[1].args.asset).to.equal(contracts.mockTokens.MockDai);
    });

    it('Only the owner can remove the tracked assets', async function () {
      await expect(
        fndzStaking
          .connect(accounts[1])
          .removeTrackedAssets([contracts.mockTokens.MockUSDC, contracts.mockTokens.MockDai]),
      ).to.revertedWith('Ownable: caller is not the owner');
    });

    it('can not remove the asset which is not in the tracked assets', async function () {
      await expect(
        fndzStaking.removeTrackedAssets([contracts.mockTokens.MockUSDC, contracts.mockTokens.MockDai]),
      ).to.revertedWith('one of the asset is not a tracked asset');
    });

    it('can get the array of tracked assets', async function () {
      const trackedAssets = await fndzStaking.getTrackedAssets();
      expect(trackedAssets.length).to.equal(1);
      expect(trackedAssets[0]).to.equal(busdToken.address);
    });

    it('owner can update the unstakeFeeRate', async function () {
      const prevFeeRate = await fndzStaking.unstakeFeeRate();
      let newFeeRate = utils.parseEther('0.02'); // 2%
      const updateTx = await fndzStaking.updateUnstakeFeeRate(newFeeRate);
      const updateReceipt = await updateTx.wait();

      const updateEvents = filterEventsByABI(updateReceipt, [unstakeFeeRateUpdatedEventABI]);
      expect(updateEvents.length).to.equal(1);
      expect(updateEvents[0].args._oldFeeRate).to.equal(prevFeeRate);
      expect(updateEvents[0].args._newFeeRate).to.equal(newFeeRate);

      // Only owner can update the fee Rate
      await expect(fndzStaking.connect(accounts[2]).updateUnstakeFeeRate(prevFeeRate)).to.revertedWith(
        'Ownable: caller is not the owner',
      );

      newFeeRate = utils.parseEther('1');
      // fee rate can be 100%
      await expect(fndzStaking.updateUnstakeFeeRate(newFeeRate)).to.be.not.reverted;

      newFeeRate = newFeeRate.add(1);
      // fee rate cannot be over 100%
      await expect(fndzStaking.updateUnstakeFeeRate(newFeeRate)).to.revertedWith(
        'updateUnstakeFeeRate: feeRate must be less than or equal to RATE_DIVISOR',
      );
    });

    it('owner can update the unstakeTimelock', async function () {
      const prevTimelock = await fndzStaking.unstakeTimelock();
      const newTimelock = 5 * 24 * 60 * 60; // 5 Days
      const updateTx = await fndzStaking.updateUnstakeTimelock(newTimelock);
      const updateReceipt = await updateTx.wait();

      const updateEvents = filterEventsByABI(updateReceipt, [unstakeTimelockUpdatedEventABI]);
      expect(updateEvents.length).to.equal(1);
      expect(updateEvents[0].args._oldTimelock).to.equal(prevTimelock);
      expect(updateEvents[0].args._newTimelock).to.equal(newTimelock);

      // Only owner can update the fee Rate
      await expect(fndzStaking.connect(accounts[2]).updateUnstakeTimelock(prevTimelock)).to.revertedWith(
        'Ownable: caller is not the owner',
      );
    });
  });
});
