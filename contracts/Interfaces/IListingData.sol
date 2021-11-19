// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import {Master} from "../Master/Master.sol";

abstract contract IListingData is Master {
    function requestIdToInsuredSumTaken(uint256)
        external
        view
        virtual
        returns (uint256);

    function coverRequestFullyFundedAt(uint256)
        external
        view
        virtual
        returns (uint256);

    function requestIdToRefundPremium(uint256)
        external
        view
        virtual
        returns (bool);

    function isDepositTakenBack(uint256) external view virtual returns (bool);

    function offerIdToInsuredSumTaken(uint256)
        external
        view
        virtual
        returns (uint256);

    function isDepositOfOfferTakenBack(uint256)
        external
        view
        virtual
        returns (bool);

    function storedRequest(
        CoverRequest memory inputRequest,
        CoinPricingInfo memory assetPricing,
        CoinPricingInfo memory feePricing,
        address member
    ) external virtual;

    function getCoverRequestById(uint256 requestId)
        external
        view
        virtual
        returns (CoverRequest memory coverRequest);

    function getCoverRequestLength() external view virtual returns (uint256);

    function storedOffer(
        CoverOffer memory inputOffer,
        CoinPricingInfo memory feePricing,
        CoinPricingInfo memory assetPricing,
        uint8 depositPeriod,
        address member
    ) external virtual;

    function getCoverOfferById(uint256 offerId)
        external
        view
        virtual
        returns (CoverOffer memory offer);

    function getCoverOffersListByAddr(address member)
        external
        view
        virtual
        returns (uint256[] memory);

    function getCoverOfferLength() external view virtual returns (uint256);

    function updateOfferInsuredSumTaken(
        uint256 offerId,
        uint256 insuredSumTaken
    ) external virtual;

    function updateRequestInsuredSumTaken(
        uint256 requestId,
        uint256 insuredSumTaken
    ) external virtual;

    function isRequestReachTarget(uint256 requestId)
        external
        view
        virtual
        returns (bool);

    function isRequestFullyFunded(uint256 requestId)
        external
        view
        virtual
        returns (bool);

    function setCoverRequestFullyFundedAt(
        uint256 requestId,
        uint256 fullyFundedAt
    ) external virtual;

    function setRequestIdToRefundPremium(uint256 requestId) external virtual;

    function setDepositOfOfferTakenBack(uint256 offerId) external virtual;

    function setIsDepositTakenBack(uint256 coverId) external virtual;

    function getBuyerToRequests(address holder)
        external
        view
        virtual
        returns (uint256[] memory);

    function getFunderToOffers(address funder)
        external
        view
        virtual
        returns (uint256[] memory);
}
