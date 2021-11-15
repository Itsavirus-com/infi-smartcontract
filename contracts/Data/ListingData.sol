// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import {Master} from "../Master/Master.sol";

contract ListingData is Master {
    // State Variable
    // Cover Request
    CoverRequest[] internal requests; // CoverRequest.id
    mapping(uint256 => uint256) public requestIdToInsuredSumTaken;
    mapping(address => uint256[]) internal buyerToRequests;
    mapping(string => uint256[]) internal coinIdToRequests;
    mapping(uint256 => uint256) public coverRequestFullyFundedAt;
    mapping(uint256 => bool) public requestIdToRefundPremium;
    mapping(uint256 => bool) public isDepositTakenBack; // coverId -> true/false
    // Cover Offer
    CoverOffer[] internal offers; // CoverOffer.id
    mapping(uint256 => uint256) public offerIdToInsuredSumTaken;
    mapping(address => uint256[]) internal funderToOffers;
    mapping(string => uint256[]) internal coinIdToOffers;
    mapping(uint256 => bool) public isDepositOfOfferTakenBack; // offer id => state of take back deposit

    // Events
    event CreateRequest(
        uint256 id,
        address indexed holder,
        CoverRequest request,
        CoinPricingInfo assetPricing,
        CoinPricingInfo feePricing
    );
    event CreateOffer(
        uint256 id,
        address indexed funder,
        CoverOffer coverOffer,
        CoinPricingInfo feePricing,
        CoinPricingInfo assetPricing,
        uint8 depositPeriod
    );
    event DepositOfOfferTakenBack(uint256 offerId);
    event DepositTakenBack(uint256 coverId);
    event RequestFullyFunded(uint256 requestId, uint256 fullyFundedAt);
    event PremiumRefunded(uint256 requestId);

    /**
     * @dev Save listing data of cover request
     */
    function storedRequest(
        CoverRequest memory inputRequest,
        CoinPricingInfo memory assetPricing,
        CoinPricingInfo memory feePricing,
        address member
    ) external {
        requests.push(inputRequest);
        uint256 requestId = requests.length - 1;
        buyerToRequests[member].push(requestId);
        coinIdToRequests[inputRequest.coinId].push(requestId);
        requestIdToInsuredSumTaken[requestId] = 0; // set insured sum taken to 0 as iniitial value
        emit CreateRequest(
            requestId,
            member,
            inputRequest,
            assetPricing,
            feePricing
        );
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Get cover request detail
     */
    function getCoverRequestById(uint256 requestId)
        external
        view
        returns (CoverRequest memory coverRequest)
    {
        return requests[requestId];
    }

    /**
     * @dev Get length of array contains Cover Request(s)
     */
    function getCoverRequestLength() external view returns (uint256) {
        return requests.length;
    }

    /**
     * @dev Save cover offer listing data
     */
    function storedOffer(
        CoverOffer memory inputOffer,
        CoinPricingInfo memory feePricing,
        CoinPricingInfo memory assetPricing,
        uint8 depositPeriod,
        address member
    ) external {
        offers.push(inputOffer);
        uint256 offerId = offers.length - 1;
        funderToOffers[member].push(offerId);
        coinIdToOffers[inputOffer.coinId].push(offerId);
        offerIdToInsuredSumTaken[offerId] = 0; // set insured sum remaining to 0 as initial
        emit CreateOffer(
            offerId,
            member,
            inputOffer,
            feePricing,
            assetPricing,
            depositPeriod
        );
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Get detail of Cover Offer
     */
    function getCoverOfferById(uint256 offerId)
        external
        view
        returns (CoverOffer memory coverOffer)
    {
        return offers[offerId];
    }

    /**
     * @dev Get list of offer id(s) that funded by member/funder
     */
    function getCoverOffersListByAddr(address member)
        external
        view
        returns (uint256[] memory)
    {
        return funderToOffers[member];
    }

    /**
     * @dev Get length of array contains Cover Offer(s)
     */
    function getCoverOfferLength() external view returns (uint256) {
        return offers.length;
    }

    /**
     * @dev Called when member take offer to update insured sum taken on Cover Offer
     */
    function updateOfferInsuredSumTaken(
        uint256 offerId,
        uint256 insuredSumTaken
    ) external {
        offerIdToInsuredSumTaken[offerId] = insuredSumTaken;
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Called when member take request to update insured sum taken on Cover Request
     */
    function updateRequestInsuredSumTaken(
        uint256 requestId,
        uint256 insuredSumTaken
    ) external {
        requestIdToInsuredSumTaken[requestId] = insuredSumTaken;
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Check whether Cover Request reach target
     * @dev For Partial : must reach minimal 25% of insured sum
     * @dev For Full : must react minimal 100% - 2 token of insured sum
     */
    function isRequestReachTarget(uint256 requestId)
        external
        view
        returns (bool)
    {
        CoverRequest memory request = requests[requestId];
        return
            requestIdToInsuredSumTaken[requestId] >= request.insuredSumTarget;
    }

    /**
     * @dev Check whether Cover Request fully funded
     * @dev Must react minimal 100% - 2 token of insured sum
     */
    function isRequestFullyFunded(uint256 requestId)
        external
        view
        returns (bool)
    {
        CoverRequest memory request = requests[requestId];
        uint8 decimal = cg.getCurrencyDecimal(
            uint8(request.insuredSumCurrency)
        );
        uint256 tolerance = 2 * (10**decimal);

        return
            (request.insuredSum - requestIdToInsuredSumTaken[requestId]) <=
            tolerance;
    }

    /**
     * @dev Called when Cover Request fully funded
     */
    function setCoverRequestFullyFundedAt(
        uint256 requestId,
        uint256 fullyFundedAt
    ) external {
        coverRequestFullyFundedAt[requestId] = fullyFundedAt;
        emit RequestFullyFunded(requestId, fullyFundedAt);
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Called when holder refund premium
     * @dev Refund premium condition :
     * @dev Withdraw premium of fail Cover Request or Withdraw of remaining premium on Cover Request
     */
    function setRequestIdToRefundPremium(uint256 requestId) external {
        requestIdToRefundPremium[requestId] = true;
        emit PremiumRefunded(requestId);
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Called when funder refund/take back deposit
     * @dev Withdraw of remaining deposit on Cover Offer
     */
    function setDepositOfOfferTakenBack(uint256 offerId) external {
        isDepositOfOfferTakenBack[offerId] = true;
        emit DepositOfOfferTakenBack(offerId);
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Called when funder refund/take back deposit, to mark deposit had taken
     */
    function setIsDepositTakenBack(uint256 coverId) external {
        isDepositTakenBack[coverId] = true;
        emit DepositTakenBack(coverId);
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Get list of request id(s) that funded by member
     */
    function getBuyerToRequests(address holder)
        external
        view
        returns (uint256[] memory)
    {
        return buyerToRequests[holder];
    }

    /**
     * @dev Get list of offer id(s) that funded by member/funder
     */
    function getFunderToOffers(address funder)
        external
        view
        returns (uint256[] memory)
    {
        return funderToOffers[funder];
    }
}
