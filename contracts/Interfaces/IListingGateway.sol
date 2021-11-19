// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {Master} from "../Master/Master.sol";

abstract contract IListingGateway is Master {
    function createCoverRequest(
        address from,
        uint256 value,
        bytes memory payData
    ) external virtual;

    function createCoverOffer(
        address from,
        uint256 value,
        bytes memory payData
    ) external virtual;

    function getListActiveCoverOffer()
        external
        view
        virtual
        returns (uint256 listLength, uint256[] memory coverOfferIds);

    function getInsuredSumTakenOfCoverOffer(uint256 coverOfferId)
        external
        view
        virtual
        returns (uint256 insuredSumTaken);

    function getChainlinkPrice(uint8 currencyType)
        external
        view
        virtual
        returns (
            uint80 roundId,
            int256 price,
            uint8 decimals
        );
}
