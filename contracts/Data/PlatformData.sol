// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import {IAccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Master} from "../Master/Master.sol";

contract PlatformData is Master {
    // State variables
    Platform[] public platforms;
    Oracle[] public oracles;
    PriceFeed[] public usdPriceFeeds;
    Custodian[] public custodians;
    mapping(string => uint256[]) internal symbolToUsdPriceFeeds;

    // Events
    event NewPlatform(uint256 id, string name, string website);
    event NewOracle(uint256 id, string name, string website);
    event NewCustodian(uint256 id, string name, string website);
    event NewPriceFeed(
        string symbol,
        uint256 usdPriceFeedsId,
        uint256 oracleId,
        uint256 chainId,
        uint8 decimals,
        address proxyAddress
    );

    /**
     * @dev Add New Platform
     */
    function addNewPlatform(string calldata name, string calldata website)
        external
    {
        // Only admin allowed to call
        require(
            IAccessControl(address(cg)).hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ERR_AUTH_1"
        );

        // Store Data
        platforms.push(Platform(name, website));
        uint256 platformId = platforms.length - 1;
        emit NewPlatform(platformId, name, website);
    }

    /**
     * @dev Add New Oracle
     */
    function addNewOracle(string calldata name, string calldata website)
        external
    {
        // Only admin allowed to call
        require(
            IAccessControl(address(cg)).hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ERR_AUTH_1"
        );

        // Store Data
        oracles.push(Oracle(name, website));
        uint256 oracleId = oracles.length - 1;
        emit NewOracle(oracleId, name, website);
    }

    /**
     * @dev Add New Custodians
     */
    function addNewCustodian(string calldata name, string calldata website)
        external
    {
        // Only admin allowed to call
        require(
            IAccessControl(address(cg)).hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ERR_AUTH_1"
        );

        // Store Data
        custodians.push(Custodian(name, website));
        uint256 custodianId = custodians.length - 1;
        emit NewCustodian(custodianId, name, website);
    }

    /**
     * @dev Add New Price Feed
     */
    function addNewPriceFeed(
        string calldata symbol,
        uint256 oracleId,
        uint256 chainId,
        uint8 decimals,
        address proxyAddress
    ) external {
        // Only admin allowed to call
        require(
            IAccessControl(address(cg)).hasRole(DEFAULT_ADMIN_ROLE, msg.sender),
            "ERR_AUTH_1"
        );

        // Store Data
        usdPriceFeeds.push(
            PriceFeed(oracleId, chainId, decimals, proxyAddress)
        );
        uint256 usdPriceFeedsId = usdPriceFeeds.length - 1;
        symbolToUsdPriceFeeds[symbol].push(usdPriceFeedsId);
        emit NewPriceFeed(
            symbol,
            usdPriceFeedsId,
            oracleId,
            chainId,
            decimals,
            proxyAddress
        );
    }

    /**
     * @dev get price feed address by coin id/symbol
     * @dev coin id reference to coingecko
     */
    function getOraclePriceFeedAddress(string calldata symbol)
        external
        view
        returns (address)
    {
        uint256[] memory priceFeeds = symbolToUsdPriceFeeds[symbol];
        if (priceFeeds.length <= 0) {
            return address(0);
        } else {
            uint256 priceFeedId = priceFeeds[priceFeeds.length - 1];
            PriceFeed memory selectedPriceFeed = usdPriceFeeds[priceFeedId];
            return selectedPriceFeed.proxyAddress;
        }
    }
}
