// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title IPropertyRegistry
 * @notice Sučelje preko kojeg escrow komunicira s registrom nekretnina.
 */
interface IPropertyRegistry {
    function getDigitalOwner(
        uint256 propertyId
    ) external view returns (address);

    function isPropertyVerified(
        uint256 propertyId
    ) external view returns (bool);

    function transferPropertyOwnership(
        uint256 propertyId,
        address newOwner
    ) external;
}