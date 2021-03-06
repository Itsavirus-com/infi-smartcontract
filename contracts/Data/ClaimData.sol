// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.0;

import {IClaimData} from "../Interfaces/IClaimData.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract ClaimData is IClaimData, UUPSUpgradeable {
    // State variable
    Claim[] internal claims;
    mapping(uint256 => uint256[]) internal coverToClaims;
    mapping(uint256 => uint256) public override claimToCover;

    CollectiveClaim[] internal collectiveClaims;
    mapping(uint256 => uint256[]) internal requestToCollectiveClaims;
    mapping(uint256 => uint256) public override collectiveClaimToRequest;

    // total payout from claim of offer cover,
    // it will record how much payout already done for cover offer
    mapping(uint256 => uint256) public override offerIdToPayout;
    mapping(uint256 => uint256) public override coverToPayout;
    // Mapping status is valid claim exists on Insurance Cover
    // InsuranceCover.id => true/false
    mapping(uint256 => bool) public override isValidClaimExistOnCover;
    // To make sure Cover from Take Offer only used unique roundId to claim
    // Mapping Insurance Cover ||--< Round Id => true/false
    mapping(uint256 => mapping(uint80 => bool))
        public
        override coverIdToRoundId;

    // it will record how much payout already done for cover request
    mapping(uint256 => uint256) public override requestIdToPayout;
    // Mapping status is valid claim exists on Cover Request
    // CoverRequest.id => true/false
    mapping(uint256 => bool) public override isValidClaimExistOnRequest;
    // To make sure Cover from Create Request only used unique roundId to claim
    // Mapping Cover Request ||--< ROund Id => true/false
    mapping(uint256 => mapping(uint80 => bool))
        public
        override requestIdToRoundId;

    // total amount of expired payout that owned by platform
    mapping(CurrencyType => uint256) public override totalExpiredPayout;

    // Calculate pending claims
    mapping(uint256 => uint16) public override offerToPendingClaims;
    mapping(uint256 => uint16) public override coverToPendingClaims;
    mapping(uint256 => uint16) public override requestToPendingCollectiveClaims;

    // Event
    event ClaimRaise(
        uint256 claimId,
        uint256 coverId,
        uint256 claimTime,
        address holder,
        uint80 roundId,
        uint256 roundTimestamp
    );
    event CollectiveClaimRaise(
        uint256 collectiveClaimId,
        uint256 requestId,
        uint256 claimTime,
        address holder,
        uint256 roundId,
        uint256 roundTimestamp
    );

    function _authorizeUpgrade(address newImplementation) internal override {
        require(super._getAdmin() == msg.sender, "ERR_AUTH_5");
    }

    /**
     * @dev Create a new Claim
     */
    function addClaim(
        uint256 coverId,
        uint256 offerId,
        uint80 roundId,
        uint256 roundTimestamp,
        address holder
    ) external override returns (uint256) {
        // Store Data Claim
        claims.push(Claim(roundId, block.timestamp, 0, ClaimState.MONITORING));
        uint256 claimId = claims.length - 1;
        coverToClaims[coverId].push(claimId);
        claimToCover[claimId] = coverId;
        coverToPendingClaims[coverId]++;
        offerToPendingClaims[offerId]++;

        // Emit event claim
        emit ClaimRaise(
            claimId,
            coverId,
            block.timestamp,
            holder,
            roundId,
            roundTimestamp
        );

        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");

        return claimId;
    }

    /**
     * @dev change payout value over Cover
     */
    function setCoverToPayout(uint256 coverId, uint256 payout)
        external
        override
    {
        coverToPayout[coverId] += payout;
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev change payout value over Cover Offer
     */
    function setOfferIdToPayout(uint256 offerId, uint256 payout)
        external
        override
    {
        offerIdToPayout[offerId] += payout;
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Get list of claim id(s) over cover
     */
    function getCoverToClaims(uint256 coverId)
        external
        view
        override
        returns (uint256[] memory)
    {
        return coverToClaims[coverId];
    }

    function setCoverIdToRoundId(uint256 coverId, uint80 roundId)
        external
        override
    {
        coverIdToRoundId[coverId][roundId] = true;
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    function updateClaimState(
        uint256 claimId,
        uint256 offerId,
        ClaimState state
    ) external override {
        Claim storage claim = claims[claimId];

        if (
            state != ClaimState.MONITORING &&
            claim.state == ClaimState.MONITORING
        ) {
            coverToPendingClaims[claimToCover[claimId]]--;
            offerToPendingClaims[offerId]--;
        }
        // Update state of Claim
        claim.state = state;

        // Update state of mark Valid  Claim existance
        if (state == ClaimState.VALID) {
            isValidClaimExistOnCover[claimToCover[claimId]] = true;
        }
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Get Claim Detail
     */
    function getClaimById(uint256 claimId)
        external
        view
        override
        returns (Claim memory)
    {
        return claims[claimId];
    }

    /**
     * @dev Called when user create claim over Cover Request
     */
    function addCollectiveClaim(
        uint256 requestId,
        uint80 roundId,
        uint256 roundTimestamp,
        address holder
    ) external override returns (uint256) {
        collectiveClaims.push(
            CollectiveClaim(roundId, block.timestamp, 0, ClaimState.MONITORING)
        );
        uint256 collectiveClaimId = collectiveClaims.length - 1;
        requestToCollectiveClaims[requestId].push(collectiveClaimId);
        collectiveClaimToRequest[collectiveClaimId] = requestId;
        requestToPendingCollectiveClaims[requestId]++;

        emit CollectiveClaimRaise(
            collectiveClaimId,
            requestId,
            block.timestamp,
            holder,
            roundId,
            roundTimestamp
        );

        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");

        return collectiveClaimId;
    }

    function setRequestIdToRoundId(uint256 requestId, uint80 roundId)
        external
        override
    {
        requestIdToRoundId[requestId][roundId] = true;
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    function setIsValidClaimExistOnRequest(uint256 requestId)
        external
        override
    {
        isValidClaimExistOnRequest[requestId] = true;
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Used for update claim status to INVALID, VALID, INVALID_AFTER_EXPIRED & VALID_AFTER_EXPIRED
     */
    function updateCollectiveClaimState(
        uint256 collectiveClaimId,
        ClaimState state
    ) external override {
        CollectiveClaim storage collectiveClaim = collectiveClaims[
            collectiveClaimId
        ];

        // Decrease number of pending claims on Cover Request
        if (
            state != ClaimState.MONITORING &&
            collectiveClaim.state == ClaimState.MONITORING
        ) {
            requestToPendingCollectiveClaims[
                collectiveClaimToRequest[collectiveClaimId]
            ]--;
        }

        // Update state
        collectiveClaim.state = state;

        // Give a mark
        if (state == ClaimState.VALID) {
            isValidClaimExistOnRequest[
                collectiveClaimToRequest[collectiveClaimId]
            ] = true;
        }

        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev change payout value over Cover Request
     */
    function setRequestIdToPayout(uint256 requestId, uint256 payout)
        external
        override
    {
        requestIdToPayout[requestId] += payout;
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Get detail of collective claim
     */
    function getCollectiveClaimById(uint256 collectiveClaimId)
        external
        view
        override
        returns (CollectiveClaim memory)
    {
        return collectiveClaims[collectiveClaimId];
    }

    /**
     * @dev Add total payout for valid expired claim
     * @dev totalExpiredPayout variable contain amount of token that own by dev because valid claim is expired
     */
    function addTotalExpiredPayout(CurrencyType currencyType, uint256 amount)
        external
        override
    {
        totalExpiredPayout[currencyType] += amount;
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    /**
     * @dev Set total payout to 0, called when developer withdraw token of expired calid claim
     */
    function resetTotalExpiredPayout(CurrencyType currencyType)
        external
        override
    {
        totalExpiredPayout[currencyType] = 0;
        // Check the caller is internal address
        require(cg.isInternal(msg.sender), "ERR_AUTH_2");
    }

    function getRequestToCollectiveClaims(uint256 requestId)
        external
        view
        override
        returns (uint256[] memory)
    {
        return requestToCollectiveClaims[requestId];
    }
}
