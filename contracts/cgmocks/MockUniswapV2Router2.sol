// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

import "../release/interfaces/IUniswapV2Router2.sol";
import "../mocks/tokens/MockToken.sol";

contract MockUniswapV2Router2 is IUniswapV2Router2 {
    function swapExactTokensForTokens(
        uint256 _sourceAmount,
        uint256 _minimumDestinationAmount,
        address[] calldata _swapPath,
        address _target,
        uint256
    ) external override returns (uint256[] memory) {
        /// Transfer _sourceAmount of _swapPath[0] to address(this)
        MockToken(_swapPath[0]).transferFrom(msg.sender, address(this), _sourceAmount);

        ///  Mint _minimumDestinationAmount of _swapPath[0] to address(this)
        MockToken(_swapPath[_swapPath.length - 1]).mintFor(_target, _minimumDestinationAmount);

        uint256[] memory tokenAmounts = new uint256[](_swapPath.length);
        tokenAmounts[0] = _sourceAmount;
        tokenAmounts[_swapPath.length - 1] = _minimumDestinationAmount;
        return tokenAmounts;
    }

    function addLiquidity(
        address,
        address,
        uint256 param3,
        uint256 param4,
        uint256 param5,
        uint256,
        address,
        uint256
    )
        external
        override
        returns (
            uint256,
            uint256,
            uint256
        )
    {
        return (param3, param4, param5);
    }

    function removeLiquidity(
        address,
        address,
        uint256 param3,
        uint256 param4,
        uint256,
        address,
        uint256
    ) external override returns (uint256, uint256) {
        return (param3, param4);
    }
}
