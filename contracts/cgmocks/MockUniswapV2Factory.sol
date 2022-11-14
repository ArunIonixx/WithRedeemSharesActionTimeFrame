// SPDX-License-Identifier: GPL-3.0

pragma solidity 0.6.12;

/// @title MockUniswapV2Factory
/// @author Curvegrid <contact@curvegrid.com>
contract MockUniswapV2Factory {
    mapping(address => mapping(address => address)) private tokensToPair;

    function registerPair(
        address _token0,
        address _token1,
        address _pair
    ) external {
        tokensToPair[_token0][_token1] = _pair;
    }

    function getPair(address _token0, address _token1) external view returns (address) {
        return tokensToPair[_token0][_token1];
    }
}
