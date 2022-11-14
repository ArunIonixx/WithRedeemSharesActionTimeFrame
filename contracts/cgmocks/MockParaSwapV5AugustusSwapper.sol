// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "../release/interfaces/IParaSwapV5AugustusSwapper.sol";
import "../release/core/fund/comptroller/ComptrollerLib.sol";
import "../mocks/tokens/MockToken.sol";

contract MockParaSwapV5AugustusSwapper is IParaSwapV5AugustusSwapper {
    using SafeMath for uint256;
    uint256 private cost;
    bool private bad;
    address private comptrollerProxy;
    uint256 private partnerFeeFactor = 10000;

    function multiSwap(SellData calldata _sellData) external payable override returns (uint256) {
        if (bad) {
            ComptrollerLib(comptrollerProxy).callOnExtension(
                address(0),
                0,
                abi.encode(new address[](0))
            );
        }

        uint256 feeSplit = 0;
        if (_sellData.feePercent > 0 && _sellData.partner != address(0)) {
            feeSplit = _sellData.expectedAmount.mul(_sellData.feePercent).div(partnerFeeFactor);
            uint256 paraSwapFeeSplit = feeSplit.mul(150000000000000000).div(1000000000000000000);
            uint256 partnerFeeSplit = feeSplit.sub(paraSwapFeeSplit);
            MockToken(_sellData.path[0].to).mintFor(_sellData.partner, partnerFeeSplit);
        }

        MockToken(_sellData.path[0].to).mintFor(
            _sellData.beneficiary,
            _sellData.expectedAmount.sub(feeSplit) - cost
        );
    }

    function protectedMultiSwap(SellData calldata _sellData)
        external
        payable
        override
        returns (uint256)
    {
        if (bad) {
            ComptrollerLib(comptrollerProxy).callOnExtension(
                address(0),
                0,
                abi.encode(new address[](0))
            );
        }

        uint256 feeSplit = 0;
        if (_sellData.feePercent > 0 && _sellData.partner != address(0)) {
            feeSplit = _sellData.expectedAmount.mul(_sellData.feePercent).div(partnerFeeFactor);
            uint256 paraSwapFeeSplit = feeSplit.mul(150000000000000000).div(1000000000000000000);
            uint256 partnerFeeSplit = feeSplit.sub(paraSwapFeeSplit);
            MockToken(_sellData.path[0].to).mintFor(_sellData.partner, partnerFeeSplit);
        }

        MockToken(_sellData.path[0].to).mintFor(
            _sellData.beneficiary,
            _sellData.expectedAmount.sub(feeSplit) - cost
        );
    }

    /// @notice Added to test the PostCOIHook in Integration Manager
    function setCost(uint256 value) external returns (bool) {
        cost = value;
        return true;
    }

    function makeItReentracyToken(address _comptrollerProxy) external {
        bad = true;
        comptrollerProxy = _comptrollerProxy;
    }
}
