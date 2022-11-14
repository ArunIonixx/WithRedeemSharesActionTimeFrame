// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "../../persistent/vault/utils/VaultLibSafeMath.sol";
import "../../release/interfaces/IUniswapV2Router2.sol";
import "../../release/interfaces/IUniswapV2Pair.sol";
import "../interfaces/IFNDZController.sol";

abstract contract InlineSwapMixin is Initializable {
    using SafeERC20 for IERC20;
    using VaultLibSafeMath for uint256;

    IFNDZController private fndzController;

    event AssetSwappedAndTransferred(
        address indexed sourceAsset,
        address indexed destinationAsset,
        address indexed target,
        uint256 sourceAmount,
        uint256 destinationAmount
    );

    function __InlineSwapMixin_init(address _fndzController) internal initializer {
        fndzController = IFNDZController(_fndzController);
    }

    /// @notice Helper for swapping a Vault asset via a Uniswap V2 router and sending the result to a given account
    /// @param _sourceAsset The vault-held asset that will be swapped
    /// @param _destinationAsset The final asset resulting from the swap which will be sent
    /// @param _target The account to which to withdraw the destination asset
    /// @param _sourceAmount The amount of the source asset to swap
    /// @param _minimumDestinationAmount The minimum amount of tokens you expect to receive after slippage
    /// @param _swapDeadline The timestamp by which the trade must execute before the transaction is reverted
    /// @param _swapPath The path for the swap, starting with the source asset and ending with the destination asset
    function __swapAndTransferAssetTo(
        address _sourceAsset,
        address _destinationAsset,
        address _target,
        uint256 _sourceAmount,
        uint256 _minimumDestinationAmount,
        uint256 _swapDeadline,
        address[] memory _swapPath
    ) internal returns (uint256 payoutAmount_) {
        require(
            _swapPath.length >= 2,
            "swapAndWithdrawAssetTo: _swapPath must have a length greater or equal to 2"
        );
        require(
            _swapPath[0] == _sourceAsset,
            "swapAndWithdrawAssetTo: first element of _swapPath must be _sourceAsset"
        );
        require(
            _swapPath[_swapPath.length - 1] == _destinationAsset,
            "swapAndWithdrawAssetTo: last element of _swapPath must be _destinationAsset"
        );
        address uniswapV2Router02 = fndzController.getInlineSwapRouterAddress();
        IERC20 assetContract = IERC20(_sourceAsset);
        if (assetContract.allowance(address(this), uniswapV2Router02) > 0) {
            assetContract.safeApprove(uniswapV2Router02, 0);
        }
        assetContract.safeApprove(uniswapV2Router02, _sourceAmount);

        uint256[] memory tokenAmounts = IUniswapV2Router2(uniswapV2Router02)
            .swapExactTokensForTokens(
            _sourceAmount,
            _minimumDestinationAmount,
            _swapPath,
            _target,
            _swapDeadline
        );

        payoutAmount_ = tokenAmounts[_swapPath.length - 1];

        emit AssetSwappedAndTransferred(
            _sourceAsset,
            _destinationAsset,
            _target,
            _sourceAmount,
            payoutAmount_
        );

        return payoutAmount_;
    }

    /// @notice Compute the minimum destination asset amount based on the allowed
    /// slippage, swap the source asset to the destination asset, and transfer
    /// it to the redemption target address.
    /// @param _sourceAsset Source asset
    /// @param _sourceAmount Source asset amount
    /// @param _destinationAsset Destination asset
    /// @param _redemptionTarget target address which receives the swapped amount
    /// @param _uniswapV2Pair Address of the Uniswap V2 compatible pair contract
    /// @param _swapDeadlineIncrement Increment in seconds to the current block
    /// time after which the swap is no longer valid
    /// @param _slippageAllowance Slippage allowance
    /// @param _slippageDivisor Slippage divisor
    function __inlineSwapAsset(
        address _sourceAsset,
        uint256 _sourceAmount,
        address _destinationAsset,
        address _redemptionTarget,
        address _uniswapV2Pair,
        uint256 _swapDeadlineIncrement,
        uint256 _slippageAllowance,
        uint256 _slippageDivisor
    ) internal returns (uint256 payoutAmount_) {
        address[] memory swapPath = new address[](2);
        swapPath[0] = _sourceAsset;
        swapPath[1] = _destinationAsset;
        uint256 minimumDestinationAmount;
        (uint256 reserve0, uint256 reserve1, ) = IUniswapV2Pair(_uniswapV2Pair).getReserves();
        if (IUniswapV2Pair(_uniswapV2Pair).token0() == _sourceAsset) {
            minimumDestinationAmount = __calculateMinimumDestinationAmount(
                _sourceAmount,
                reserve0,
                reserve1,
                _slippageAllowance,
                _slippageDivisor
            );
        } else {
            minimumDestinationAmount = __calculateMinimumDestinationAmount(
                _sourceAmount,
                reserve1,
                reserve0,
                _slippageAllowance,
                _slippageDivisor
            );
        }
        payoutAmount_ = __swapAndTransferAssetTo(
            _sourceAsset,
            _destinationAsset,
            _redemptionTarget,
            _sourceAmount,
            minimumDestinationAmount,
            block.timestamp.add(_swapDeadlineIncrement),
            swapPath
        );
    }

    /// @notice Compute the minimum destination asset amount with the given slippage allowance.
    /// @param _sourceAmount Source asset amount
    /// @param _reserveSource Reserve source amount (token supply)
    /// @param _reserveDestination Reserve destination amount (token supply)
    /// @param _slippageAllowance Slippage allowance
    /// @param _slippageDivisor Slippage divisor
    function __calculateMinimumDestinationAmount(
        uint256 _sourceAmount,
        uint256 _reserveSource,
        uint256 _reserveDestination,
        uint256 _slippageAllowance,
        uint256 _slippageDivisor
    ) internal pure returns (uint256 minimumAmountAfterSlippage_) {
        // Implements formula from
        // https://ethereum.stackexchange.com/questions/83701/how-to-infer-token-price-from-ethereum-blockchain-uniswap-data
        return
            _reserveDestination
                .mul(_sourceAmount)
                .div(_reserveSource.add(_sourceAmount))
                .mul(_slippageAllowance)
                .div(_slippageDivisor);
    }
}
