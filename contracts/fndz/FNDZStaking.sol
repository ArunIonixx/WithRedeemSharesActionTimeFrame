// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "../release/interfaces/IUniswapV2Factory.sol";
import "../release/utils/AddressArrayLib.sol";
import "./utils/InlineSwapMixin.sol";
import "./interfaces/IFNDZController.sol";
import "./interfaces/IFNDZStaking.sol";
import "./utils/StakeOrderLinking.sol";

contract FNDZStaking is IFNDZStaking, InlineSwapMixin, Ownable, StakeOrderLinking {
    using AddressArrayLib for address[];
    struct StakeInfo {
        uint256 stakedAmount;
        uint256 stakeUpdatedAt;
        bool hasEarnedRewards;
    }

    struct UnstakeInfo {
        uint256 unstakedAmount;
        uint256 unstakedAt;
    }

    uint256 private constant RATE_DIVISOR = 1000000000000000000;

    // State Variables
    uint256 public unstakeTimelock;
    uint256 public unstakeFeeRate;

    IERC20 private fndzToken;
    IFNDZController private fndzController;
    uint256 public totalFNDZStaked; // tracks the total FNDZ token staked in address(this)
    uint256 public totalUnstakedFNDZ; // tracks the total unstaked FNDZ tokens which are not yet withdrawn
    address[] public trackedAssets;
    mapping(address => bool) private assetToIsTracked;

    mapping(address => StakeInfo) public stakeholderToStakeInfo;
    mapping(address => UnstakeInfo) public stakeholderToUnstakeInfo;
    mapping(address => uint256) public trackedAssetToTotalAllocatedRewardAmount; // Used to store the current quantity of the tracked asset that has been promised to stakeholders, but not yet claimed
    mapping(address => mapping(address => uint256)) public stakeholderToTrackedAssetToRewardAmount; // Used to store the current quantity of a tracked asset that has been promised to a particular stakeholder, but not yet claimed

    // Events
    event TrackedAssetAdded(address asset);
    event TrackedAssetRemoved(address asset);
    event FNDZStaked(address indexed stakeholder, uint256 stakedAmount);
    event FNDZUnstaked(address indexed stakeholder, uint256 unstakedAmount);
    event FNDZWithdrawn(
        address indexed stakeholder,
        uint256 unstakedAmount,
        uint256 withdrawnAmount
    );
    event WithdrawFeeSettled(
        address payer,
        address payee,
        uint256 unstakeAmount,
        uint256 feeAmount
    );
    event RewardsClaimedAsFNDZ(address stakeholder, uint256 claimedFNDZ);
    event RewardsClaimedAsTrackedAssets(
        address stakeholder,
        address[] rewardedAssets,
        uint256[] rewardedAmounts
    );
    event EarnedRewardsUpdated(
        address stakeholder,
        address[] earnedAssets,
        uint256[] earnedAmounts
    );
    event UnstakeTimelockUpdated(uint256 _oldTimelock, uint256 _newTimelock);
    event UnstakeFeeRateUpdated(uint256 _oldFeeRate, uint256 _newFeeRate);

    /// @notice It initializes the InlineSwapMixin and assign values to the
    /// state variables while deploy
    /// @param _fndzController - Address of the FNDZ Controller contract
    constructor(address _fndzController) public {
        __InlineSwapMixin_init(_fndzController);

        unstakeTimelock = 10 days;
        unstakeFeeRate = 50000000000000000;

        fndzController = IFNDZController(_fndzController);
        fndzToken = IERC20(fndzController.fndzToken());
    }

    /// @notice - add address of the assets to the tracked list
    /// @param _assets - array of asset address to keep track for rewards
    function addTrackedAssets(address[] calldata _assets) external onlyOwner {
        for (uint256 i = 0; i < _assets.length; i++) {
            require(!isTrackedAsset(_assets[i]), "one of the asset is already a tracked asset");

            assetToIsTracked[_assets[i]] = true;
            trackedAssets.push(_assets[i]);
            emit TrackedAssetAdded(_assets[i]);
        }
    }

    /// @notice - removes the array asset addresses from the tracked asset list
    /// @param _assets - array of asset address to remove from the tracked assets
    function removeTrackedAssets(address[] calldata _assets) external onlyOwner {
        for (uint256 i = 0; i < _assets.length; i++) {
            require(isTrackedAsset(_assets[i]), "one of the asset is not a tracked asset");

            assetToIsTracked[_assets[i]] = false;
            uint256 trackedAssetsCount = trackedAssets.length;
            for (uint256 j = 0; j < trackedAssetsCount; j++) {
                if (trackedAssets[j] == _assets[i]) {
                    if (j < trackedAssetsCount - 1) {
                        trackedAssets[j] = trackedAssets[trackedAssetsCount - 1];
                    }
                    trackedAssets.pop();
                    break;
                }
            }
            emit TrackedAssetRemoved(_assets[i]);
        }
    }

    /// @notice - using this function owner can be able to update the timelock period of unstake
    /// @param _timelock - time lock period of unstake in seconds
    function updateUnstakeTimelock(uint256 _timelock) external onlyOwner {
        uint256 oldTimelock = unstakeTimelock;
        unstakeTimelock = _timelock;
        emit UnstakeTimelockUpdated(oldTimelock, unstakeTimelock);
    }

    /// @notice - using this function, owner can be able to update the fee rate of the unstake
    /// @param _feeRate - unstake fee rate to claim
    function updateUnstakeFeeRate(uint256 _feeRate) external onlyOwner {
        require(
            _feeRate <= RATE_DIVISOR,
            "updateUnstakeFeeRate: feeRate must be less than or equal to RATE_DIVISOR"
        );
        uint256 oldFeeRate = unstakeFeeRate;
        unstakeFeeRate = _feeRate;
        emit UnstakeFeeRateUpdated(oldFeeRate, unstakeFeeRate);
    }

    /// @notice - This method stake FNDZ token in address(this). Anyone can stake using this method
    /// @dev The msg.sender should have provided the allowance of _stakeAmount to address(this)
    /// @param _stakeAmount - the amount of FNDZ token to stake
    function stakeFNDZ(uint256 _stakeAmount) external {
        __stakeFNDZ(msg.sender, _stakeAmount, false);
    }

    /// @notice - This method unstakes the FNDZ tokens
    /// @dev - requested amount will be removed from staked amount of the msg.sender
    /// earned rewards will be updated based on the time period between stakeInfo.stakeUpdatedAt to block.timestamp
    /// The unstaked amount will be in the staking pool until withdrawn.
    /// But will not be taken into account in further reward calculations to the user.
    /// @param _unstakeAmount - The amount of FNDZ tokens needs to be unstaked
    function unstakeFNDZ(uint256 _unstakeAmount) external {
        __unstakeFNDZ(msg.sender, _unstakeAmount);
    }

    /// @notice - This method withdraw the FNDZ token from the staking pool
    /// @dev - if the _withdrawAmount is not unstaked and completed the lockup period
    /// the amount will be directly withdrawn else unstake fee (unstakeFeeRate %) will be deducted from withdraw amount
    /// @param _withdrawAmount - the amount of FNDZ tokens that needs to be withdrawn
    function withdrawFNDZ(uint256 _withdrawAmount) external {
        // Unstake the FNDZ token if not yet unstaked
        if (stakeholderToUnstakeInfo[msg.sender].unstakedAt == 0) {
            __unstakeFNDZ(msg.sender, _withdrawAmount);
        }

        UnstakeInfo memory unstakeInfo = stakeholderToUnstakeInfo[msg.sender];
        require(
            _withdrawAmount == unstakeInfo.unstakedAmount,
            "withdraw amount must equal the unstaked amount"
        );
        totalUnstakedFNDZ = totalUnstakedFNDZ.sub(_withdrawAmount);

        // Collect unstake fee if time of unstaked not yet completed the timelock
        uint256 feeSettled;
        if (unstakeInfo.unstakedAt.add(unstakeTimelock) > block.timestamp) {
            feeSettled = __settleFee(msg.sender, _withdrawAmount);
        }

        delete stakeholderToUnstakeInfo[msg.sender];

        uint256 withdrawableFNDZ = _withdrawAmount.sub(feeSettled);
        fndzToken.safeTransfer(msg.sender, withdrawableFNDZ);

        emit FNDZWithdrawn(msg.sender, _withdrawAmount, withdrawableFNDZ);
    }

    /// @notice - This method claims the earned rewards of the user as as the underlying assets
    /// @dev - Before claim, updates the earned rewards of staked FNDZ token
    /// in the period of stakeInfo.stakeUpdatedAt to block.timestamp
    /// earned rewards will be converted to equivalent amount of tracked assets
    /// and will be transferred to the mentioned _beneficiary (stakeholder or staking pool)
    /// @param _assetsToSkip - array of asset assets to skip from tracked assets. The
    /// corresponding portion of rewards of the skipped asset will be forfeited by the stakeholder.
    function claimRewards(address[] memory _assetsToSkip) external {
        require(_assetsToSkip.isUniqueSet(), "claimRewards: __assetsToSkip contains duplicates");

        address[] memory payoutAssets = trackedAssets.removeItems(_assetsToSkip);
        require(payoutAssets.length > 0, "claimRewards: no payout to claim");

        StakeInfo memory stakeInfo = stakeholderToStakeInfo[msg.sender];
        if (stakeInfo.stakedAmount > 0) {
            __updateEarnedRewards(msg.sender);
            __removeFromStakeOrderLink(msg.sender);
            __addToStakeOrderLink(msg.sender);
        }

        require(
            stakeholderToStakeInfo[msg.sender].hasEarnedRewards,
            "claimRewards: No rewards earned"
        );

        stakeholderToStakeInfo[msg.sender].hasEarnedRewards = false;
        stakeholderToStakeInfo[msg.sender].stakeUpdatedAt = block.timestamp;

        // The rewards will be claims as a fraction of underlying assets itself
        uint256[] memory rewardedAmounts = new uint256[](payoutAssets.length);
        for (uint256 i = 0; i < payoutAssets.length; i++) {
            uint256 payoutAmount = stakeholderToTrackedAssetToRewardAmount[msg
                .sender][payoutAssets[i]];
            stakeholderToTrackedAssetToRewardAmount[msg.sender][payoutAssets[i]] = 0;
            trackedAssetToTotalAllocatedRewardAmount[payoutAssets[i]] = trackedAssetToTotalAllocatedRewardAmount[payoutAssets[i]]
                .sub(payoutAmount);

            if (payoutAmount > 0) {
                IERC20(payoutAssets[i]).safeTransfer(msg.sender, payoutAmount);
            }
            rewardedAmounts[i] = payoutAmount;
        }

        emit RewardsClaimedAsTrackedAssets(msg.sender, payoutAssets, rewardedAmounts);
    }

    /// @notice - This method claims the rewards as FNDZ by swapping the tracked assets
    /// for FNDZ and sending it to the stakeholder
    /// @param _swapData - Encoded data that contains the tracked assets to claim, the
    /// corresponding path required to swap to FNDZ, and the minimum destination
    /// amounts expected after each swap.
    function claimRewardsAsFNDZ(bytes calldata _swapData) external {
        (
            address[] memory assetsToInclude,
            address[][] memory swapPaths,
            uint256[] memory minimumFndzAmounts
        ) = abi.decode(_swapData, (address[], address[][], uint256[]));

        __claimRewardsAsFNDZ(msg.sender, assetsToInclude, swapPaths, minimumFndzAmounts);
    }

    /// @notice - This method claims the rewards, swaps the tracked assets to FNDZ,
    /// and restakes the claimed FNDZ for the stakeholder
    /// @param _swapData - Encoded data that contains the tracked assets to claim, the
    /// corresponding path required to swap to FNDZ, and the minimum destination
    /// amounts expected after each swap.
    function claimRewardsAndStake(bytes calldata _swapData) external {
        (
            address[] memory assetsToInclude,
            address[][] memory swapPaths,
            uint256[] memory minimumFndzAmounts
        ) = abi.decode(_swapData, (address[], address[][], uint256[]));

        uint256 claimedFNDZTokens = __claimRewardsAsFNDZ(
            address(this),
            assetsToInclude,
            swapPaths,
            minimumFndzAmounts
        );
        __stakeFNDZ(msg.sender, claimedFNDZTokens, true);
    }

    //------------------//
    // Helper Functions //
    //------------------//

    /// @notice - Helper method to stake FNDZ in the staking pool
    /// @dev - If the _stakeholder already staked some FNDZ tokens and the caller is not claimRewardsAndStake
    /// then will update the earned rewards upto the current block for the existing stake.
    /// Then from this block, it will be considered as a new stake with updated timestamp
    /// @param _stakeholder - address of the staker
    /// @param _stakeAmount - amount of FNDZ token to stake
    /// @param _stakingClaimedFNDZ - A boolean to indicate if the FNDZ being staked are coming from a claimed reward from an existing stake
    function __stakeFNDZ(
        address _stakeholder,
        uint256 _stakeAmount,
        bool _stakingClaimedFNDZ
    ) private {
        require(_stakeAmount > 0, "_stakeAmount: Empty __stakeAmount");

        StakeInfo memory stakeInfo = stakeholderToStakeInfo[_stakeholder];
        if (!_stakingClaimedFNDZ) {
            if (stakeInfo.stakedAmount > 0) {
                __updateEarnedRewards(_stakeholder);
                __removeFromStakeOrderLink(_stakeholder);
            }
            fndzToken.safeTransferFrom(_stakeholder, address(this), _stakeAmount);
            __addToStakeOrderLink(_stakeholder);
        }

        stakeholderToStakeInfo[_stakeholder].stakedAmount = stakeInfo.stakedAmount.add(
            _stakeAmount
        );
        stakeholderToStakeInfo[_stakeholder].stakeUpdatedAt = block.timestamp;
        totalFNDZStaked = totalFNDZStaked.add(_stakeAmount);

        emit FNDZStaked(_stakeholder, _stakeAmount);
    }

    /// @notice - Helper method to unstake FNDZ tokens of the stake holder.
    /// update the unstaked state of the tokens and earned rewards for the previously staked FNDZ
    /// @param _stakeholder - address of the staker
    /// @param _unstakeAmount - the amount of FNDZ token that needs to unstaked
    function __unstakeFNDZ(address _stakeholder, uint256 _unstakeAmount) private {
        require(_unstakeAmount > 0, "__unstakeFNDZ: Empty _unstakeAmount");

        StakeInfo memory stakeInfo = stakeholderToStakeInfo[_stakeholder];
        require(
            stakeholderToUnstakeInfo[_stakeholder].unstakedAt == 0,
            "stakeholder already has some unstaked tokens"
        );
        require(_unstakeAmount <= stakeInfo.stakedAmount, "Insufficient staked amount");

        __updateEarnedRewards(_stakeholder);
        __removeFromStakeOrderLink(_stakeholder);

        if (_unstakeAmount == stakeInfo.stakedAmount) {
            stakeholderToStakeInfo[_stakeholder].stakeUpdatedAt = 0;
        } else {
            stakeholderToStakeInfo[_stakeholder].stakeUpdatedAt = block.timestamp;
            __addToStakeOrderLink(_stakeholder);
        }

        stakeholderToStakeInfo[_stakeholder].stakedAmount = stakeInfo.stakedAmount.sub(
            _unstakeAmount
        );
        totalFNDZStaked = totalFNDZStaked.sub(_unstakeAmount);
        totalUnstakedFNDZ = totalUnstakedFNDZ.add(_unstakeAmount);
        stakeholderToUnstakeInfo[_stakeholder] = UnstakeInfo(_unstakeAmount, block.timestamp);

        emit FNDZUnstaked(_stakeholder, _unstakeAmount);
    }

    /// @notice - Helper method to settle the withdrawal fee
    /// @dev - Should be called only when the tokens were not unstaked or unstaked and not completed the lockup period
    /// @param _payer - address of the fee payer
    /// @param _unstakeAmount - the amount of FNDZ token that needs to be unstaked and withdrawn
    /// @return feeSettled_ - the amount of FNDZ token fee settled
    function __settleFee(address _payer, uint256 _unstakeAmount)
        private
        returns (uint256 feeSettled_)
    {
        uint256 feeDue = _unstakeAmount.mul(unstakeFeeRate).div(RATE_DIVISOR);
        address payee = IFNDZController(fndzController).fndzDao();

        fndzToken.safeTransfer(payee, feeDue);
        emit WithdrawFeeSettled(_payer, payee, _unstakeAmount, feeDue);
        return feeDue;
    }

    /// @notice - Helper method to calculate the rewards available for the staked amount to the stake holder
    /// @dev - _rewardableFNDZ is passed in params to avoid execution time value change.
    /// So it should be calculated and used in the entire functions.
    /// @param _stakeholder - the address of the user who staked the FNDZ tokens
    /// @return earnedRewardUnits_ - The amount of Reward units that can be rewarded at this particular time
    /// for the _stakedAmount
    function __calculateRewardFraction(address _stakeholder)
        private
        view
        returns (uint256 earnedRewardUnits_)
    {
        if (totalFNDZStaked > 0) {
            uint256 totalDaysStaked = block
                .timestamp
                .sub(stakeholderToStakeInfo[_stakeholder].stakeUpdatedAt)
                .div(24 hours);
            uint256 maximumDaysStaked = block
                .timestamp
                .sub(stakeholderToStakeInfo[firstStakeholder].stakeUpdatedAt)
                .div(24 hours);
            earnedRewardUnits_ = stakeholderToStakeInfo[_stakeholder]
                .stakedAmount
                .mul(totalDaysStaked)
                .mul(RATE_DIVISOR)
                .div(totalFNDZStaked)
                .div(Math.max(365, maximumDaysStaked));
        }
    }

    /// @notice - Helper method to update the earned rewards for the staked amount to the stake holder
    /// @param _stakeholder - the address of the user who staked the FNDZ tokens
    function __updateEarnedRewards(address _stakeholder) private {
        uint256 earnedRewardFraction = __calculateRewardFraction(_stakeholder);
        if (earnedRewardFraction > 0) {
            stakeholderToStakeInfo[_stakeholder].hasEarnedRewards = true;

            // Updating the allocated amount of each tracked assets
            uint256[] memory earnedAmounts = new uint256[](trackedAssets.length);
            for (uint256 i = 0; i < trackedAssets.length; i++) {
                uint256 rewardableBalance = getRewardBalance(trackedAssets[i]);
                uint256 earnedAmount = rewardableBalance.mul(earnedRewardFraction).div(
                    RATE_DIVISOR
                );
                trackedAssetToTotalAllocatedRewardAmount[trackedAssets[i]] = trackedAssetToTotalAllocatedRewardAmount[trackedAssets[i]]
                    .add(earnedAmount);
                stakeholderToTrackedAssetToRewardAmount[_stakeholder][trackedAssets[i]] = stakeholderToTrackedAssetToRewardAmount[_stakeholder][trackedAssets[i]]
                    .add(earnedAmount);
                earnedAmounts[i] = earnedAmount;
            }

            emit EarnedRewardsUpdated(_stakeholder, trackedAssets, earnedAmounts);
        }
    }

    /// @notice - This method claims the earned rewards of the user as FNDZ Tokens
    /// @dev - Before claim, updates the earned rewards of staked FNDZ token
    /// in the period of stakeInfo.stakeUpdatedAt to block.timestamp
    /// earned rewards will be converted to equivalent amount of tracked assets
    /// and will be transferred to the mentioned _beneficiary (stakeholder or staking pool)
    /// @param _beneficiary - The address which will be rewarded with the claimed FNDZ
    /// @param _assetsToInclude - subset of tracked assets whose rewards will be claimed by the stakeholder
    /// @param _swapPaths - array of swap paths used to route the swap from the corresponding
    /// tracked asset to the FNDZ token
    /// @param _minimumFndzAmounts - the expected minimum of FNDZ tokens for each of the swaps
    function __claimRewardsAsFNDZ(
        address _beneficiary,
        address[] memory _assetsToInclude,
        address[][] memory _swapPaths,
        uint256[] memory _minimumFndzAmounts
    ) private returns (uint256 fndzTokensClaimed_) {
        require(
            _swapPaths.length == _minimumFndzAmounts.length,
            "__claimRewardsAsFNDZ: swapPaths length must match minimumFndzAmounts length"
        );

        require(
            _assetsToInclude.length == _minimumFndzAmounts.length,
            "__claimRewardsAsFNDZ: assetsToInclude length must match minimumFndzAmounts length"
        );
        require(
            _assetsToInclude.isUniqueSet(),
            "__claimRewardsAsFNDZ: assetsToInclude must not contain duplicates"
        );

        require(
            _assetsToInclude.isSubsetOf(trackedAssets),
            "__claimRewardsAsFNDZ: assetsToInclude must be a subset of trackedAssets"
        );

        require(_assetsToInclude.length > 0, "__claimRewardsAsFNDZ: no payout to claim");

        StakeInfo memory stakeInfo = stakeholderToStakeInfo[msg.sender];
        if (stakeInfo.stakedAmount > 0) {
            __updateEarnedRewards(msg.sender);
            __removeFromStakeOrderLink(msg.sender);
            __addToStakeOrderLink(msg.sender);
        }

        require(
            stakeholderToStakeInfo[msg.sender].hasEarnedRewards,
            "__claimRewardsAsFNDZ: No rewards earned"
        );

        stakeholderToStakeInfo[msg.sender].hasEarnedRewards = false;
        stakeholderToStakeInfo[msg.sender].stakeUpdatedAt = block.timestamp;

        // The rewards will be sent to the staker as FNDZ token by swapping the underlying assets
        for (uint256 i = 0; i < _assetsToInclude.length; i++) {
            uint256 payoutAmount = stakeholderToTrackedAssetToRewardAmount[msg
                .sender][_assetsToInclude[i]];
            stakeholderToTrackedAssetToRewardAmount[msg.sender][_assetsToInclude[i]] = 0;
            trackedAssetToTotalAllocatedRewardAmount[_assetsToInclude[i]] = trackedAssetToTotalAllocatedRewardAmount[_assetsToInclude[i]]
                .sub(payoutAmount);

            if (payoutAmount > 0) {
                uint256 transferredTokens = __swapAndTransferAsset(
                    _assetsToInclude[i],
                    address(fndzToken),
                    payoutAmount,
                    _minimumFndzAmounts[i],
                    _swapPaths[i],
                    _beneficiary
                );
                fndzTokensClaimed_ = fndzTokensClaimed_.add(transferredTokens);
            }
        }
        emit RewardsClaimedAsFNDZ(msg.sender, fndzTokensClaimed_);
    }

    /// @dev method to swap tokens and transfers the swapped tokens to the beneficiary
    /// @param _sourceAsset source asset address of the swap
    /// @param _destinationAsset destination asset address of the swap
    /// @param _sourceAmount the amount of _sourceAsset to swap
    /// @param _swapPath - path to swap from _sourceAsset to _destinationAsset
    /// @param _minimumDestinationAmount - minimum amount of tokens you expect to receive after slippage
    /// @param _beneficiary the address of the user who receives the swapped tokens
    function __swapAndTransferAsset(
        address _sourceAsset,
        address _destinationAsset,
        uint256 _sourceAmount,
        uint256 _minimumDestinationAmount,
        address[] memory _swapPath,
        address _beneficiary
    ) private returns (uint256 receivedAmount_) {
        (, , uint256 swapDeadlineIncrement, , ) = fndzController.getFeeInlineSwapData();

        uint256 assetBalance = IERC20(_sourceAsset).balanceOf(address(this));
        require(
            _sourceAmount <= assetBalance,
            "__swapAndTransferAsset: Insufficient asset balance"
        );
        if (_sourceAsset == _destinationAsset) {
            IERC20(_sourceAsset).safeTransfer(_beneficiary, _sourceAmount);
            return _sourceAmount;
        }
        if (_swapPath.length == 0) {
            IERC20(_sourceAsset).safeTransfer(msg.sender, _sourceAmount);
            return 0;
        }

        return
            __swapAndTransferAssetTo(
                _sourceAsset,
                _destinationAsset,
                _beneficiary,
                _sourceAmount,
                _minimumDestinationAmount,
                block.timestamp.add(swapDeadlineIncrement),
                _swapPath
            );
    }

    //---------------//
    // State Getters //
    //---------------//

    /// @notice - returns whether an asset address is a tracked asset or not
    /// @param _asset - address of the asset
    function isTrackedAsset(address _asset) public view returns (bool) {
        return assetToIsTracked[_asset];
    }

    /// @notice - returns the amount of FNDZ tokens staked by the _stakeholder
    /// @param _stakeholder - address of the  FNDZ stake holder
    /// @return stakedAmount_ - the amount of staked FNDZ tokens
    function getStakedAmount(address _stakeholder)
        external
        view
        override
        returns (uint256 stakedAmount_)
    {
        return stakeholderToStakeInfo[_stakeholder].stakedAmount;
    }

    /// @notice - returns the reward balance available for the specific asset
    /// @dev - It excludes the staked FNDZ token if _asset is FNDZ token address
    /// @param _asset - address of the asset
    /// @return balance_ - balance amount of the asset
    function getRewardBalance(address _asset) public view returns (uint256 balance_) {
        if (isTrackedAsset(_asset)) {
            balance_ = IERC20(_asset).balanceOf(address(this));
            if (_asset == address(fndzToken)) {
                balance_ = balance_.sub(totalFNDZStaked.add(totalUnstakedFNDZ));
            }
            balance_ = balance_.sub(trackedAssetToTotalAllocatedRewardAmount[_asset]);
        }
    }

    /// @notice - returns the trackes assets array
    /// @return trackedAssets_ - array of assets being tracked for rewards
    function getTrackedAssets() public view returns (address[] memory trackedAssets_) {
        return trackedAssets;
    }

    /// @notice - returns the list of claimable amounts of each tracked assets by a stakeholder
    /// @param _stakeholder - address of the stakeholder
    /// @return earnedAssets_ - array of asset addresses that user earned
    /// @return claimableAmounts_ - array of amounts earned in each of the earnedAssets_
    function getClaimableRewards(address _stakeholder)
        external
        view
        returns (address[] memory earnedAssets_, uint256[] memory claimableAmounts_)
    {
        earnedAssets_ = trackedAssets;
        claimableAmounts_ = new uint256[](trackedAssets.length);
        uint256 earnedRewardFraction = __calculateRewardFraction(_stakeholder);
        for (uint256 i = 0; i < trackedAssets.length; i++) {
            uint256 currentRewardAmount = getRewardBalance(trackedAssets[i])
                .mul(earnedRewardFraction)
                .div(RATE_DIVISOR);
            claimableAmounts_[i] = (
                stakeholderToTrackedAssetToRewardAmount[_stakeholder][trackedAssets[i]]
            )
                .add(currentRewardAmount);
        }
    }
}
