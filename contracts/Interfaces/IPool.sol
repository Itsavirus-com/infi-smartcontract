// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {Master} from "../Master/Master.sol";

/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
abstract contract IPool is Master {
    function transferAndBurnInfi(uint256 listingFee) external virtual;

    function getListingFee(
        CurrencyType insuredSumCurrency,
        uint256 insuredSum,
        uint256 feeCoinPrice,
        uint80 roundId
    ) external view virtual returns (uint256);

    function acceptAsset(
        address from,
        CurrencyType currentyType,
        uint256 amount,
        bytes memory premiumPermit
    ) external virtual;

    function transferAsset(
        address to,
        CurrencyType currentyType,
        uint256 amount
    ) external virtual;

    function verifyMessage(CoinPricingInfo memory coinPricing, address whose)
        external
        view
        virtual;
}
