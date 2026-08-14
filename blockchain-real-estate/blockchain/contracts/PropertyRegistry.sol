// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title PropertyRegistry
 * @notice Registar nekretnina i njihovih digitalnih vlasnika.
 *
 * Ovaj pametni ugovor predstavlja prototip i ne zamjenjuje
 * službeni upis vlasništva u zemljišne knjige Republike Hrvatske.
 */
contract PropertyRegistry is AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant TRANSFER_ROLE = keccak256("TRANSFER_ROLE");

    /**
     * @notice Status provjere nekretnine i pripadajuće dokumentacije.
     */
    enum VerificationStatus {
        Pending,
        Verified,
        Rejected
    }

    /**
     * @notice Podaci o nekretnini spremljenoj u registru.
     */
    struct Property {
        uint256 id;
        string cadastralMunicipality;
        string parcelNumber;
        string propertyAddress;
        bytes32 documentHash;
        address digitalOwner;
        VerificationStatus verificationStatus;
        bool exists;
    }

    uint256 private nextPropertyId = 1;

    mapping(uint256 => Property) private properties;

    /**
     * @notice Sprema informaciju je li određena katastarska čestica
     * već registrirana.
     */
    mapping(bytes32 => bool) private registeredParcels;

    /**
     * @notice Događaj koji se zapisuje kada korisnik registrira nekretninu.
     */
    event PropertyRegistered(
        uint256 indexed propertyId,
        address indexed digitalOwner,
        string cadastralMunicipality,
        string parcelNumber
    );

    /**
     * @notice Događaj koji se zapisuje kada verifikator potvrdi nekretninu.
     */
    event PropertyVerified(
        uint256 indexed propertyId,
        address indexed verifier
    );

    /**
     * @notice Događaj koji se zapisuje kada verifikator odbije nekretninu.
     */
    event PropertyRejected(
        uint256 indexed propertyId,
        address indexed verifier
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Registrira novu nekretninu u blockchain registru.
     *
     * @param cadastralMunicipality Katastarska općina.
     * @param parcelNumber Broj katastarske čestice.
     * @param propertyAddress Adresa nekretnine.
     * @param documentHash Hash dokumentacije nekretnine.
     *
     * @return propertyId Jedinstveni identifikator nekretnine.
     */
    function registerProperty(
        string calldata cadastralMunicipality,
        string calldata parcelNumber,
        string calldata propertyAddress,
        bytes32 documentHash
    ) external returns (uint256 propertyId) {
        require(
            bytes(cadastralMunicipality).length > 0,
            "Katastarska opcina je obavezna"
        );

        require(bytes(parcelNumber).length > 0, "Broj cestice je obavezan");

        require(
            bytes(propertyAddress).length > 0,
            "Adresa nekretnine je obavezna"
        );

        require(documentHash != bytes32(0), "Hash dokumentacije nije valjan");

        bytes32 parcelKey = keccak256(
            abi.encode(cadastralMunicipality, parcelNumber)
        );

        require(
            !registeredParcels[parcelKey],
            "Nekretnina je vec registrirana"
        );

        propertyId = nextPropertyId;

        properties[propertyId] = Property({
            id: propertyId,
            cadastralMunicipality: cadastralMunicipality,
            parcelNumber: parcelNumber,
            propertyAddress: propertyAddress,
            documentHash: documentHash,
            digitalOwner: msg.sender,
            verificationStatus: VerificationStatus.Pending,
            exists: true
        });

        registeredParcels[parcelKey] = true;
        nextPropertyId++;

        emit PropertyRegistered(
            propertyId,
            msg.sender,
            cadastralMunicipality,
            parcelNumber
        );

        return propertyId;
    }

    /**
     * @notice Potvrđuje nekretninu i pripadajuću dokumentaciju.
     *
     * Funkciju može pozvati samo korisnik s VERIFIER_ROLE ulogom.
     *
     * @param propertyId Jedinstveni identifikator nekretnine.
     */
    function verifyProperty(
        uint256 propertyId
    ) external onlyRole(VERIFIER_ROLE) {
        require(properties[propertyId].exists, "Nekretnina ne postoji");

        require(
            properties[propertyId].verificationStatus ==
                VerificationStatus.Pending,
            "Nekretnina vise nije na cekanju"
        );

        properties[propertyId].verificationStatus = VerificationStatus.Verified;

        emit PropertyVerified(propertyId, msg.sender);
    }

    /**
     * @notice Odbija nekretninu i pripadajuću dokumentaciju.
     *
     * Funkciju može pozvati samo korisnik s VERIFIER_ROLE ulogom.
     *
     * @param propertyId Jedinstveni identifikator nekretnine.
     */
    function rejectProperty(
        uint256 propertyId
    ) external onlyRole(VERIFIER_ROLE) {
        require(properties[propertyId].exists, "Nekretnina ne postoji");

        require(
            properties[propertyId].verificationStatus ==
                VerificationStatus.Pending,
            "Nekretnina vise nije na cekanju"
        );

        properties[propertyId].verificationStatus = VerificationStatus.Rejected;

        emit PropertyRejected(propertyId, msg.sender);
    }

    /**
     * @notice Mijenja digitalnog vlasnika potvrđene nekretnine.
     *
     * Funkciju može pozvati samo adresa s TRANSFER_ROLE ulogom.
     * U konačnoj verziji tu će ulogu imati escrow pametni ugovor.
     *
     * @param propertyId Jedinstveni identifikator nekretnine.
     * @param newOwner Adresa novog digitalnog vlasnika.
     */
    function transferPropertyOwnership(
        uint256 propertyId,
        address newOwner
    ) external onlyRole(TRANSFER_ROLE) {
        require(properties[propertyId].exists, "Nekretnina ne postoji");

        require(
            properties[propertyId].verificationStatus ==
                VerificationStatus.Verified,
            "Nekretnina nije potvrdena"
        );

        require(newOwner != address(0), "Adresa novog vlasnika nije valjana");

        address previousOwner = properties[propertyId].digitalOwner;

        require(
            previousOwner != newOwner,
            "Novi vlasnik je vec trenutni vlasnik"
        );

        properties[propertyId].digitalOwner = newOwner;

        emit PropertyOwnershipTransferred(propertyId, previousOwner, newOwner);
    }

    /**
     * @notice Vraća ukupan broj registriranih nekretnina.
     *
     * @return Ukupan broj nekretnina u registru.
     */
    function getPropertyCount() external view returns (uint256) {
        return nextPropertyId - 1;
    }

    /**
     * @notice Vraća adresu trenutačnog digitalnog vlasnika nekretnine.
     */
    function getDigitalOwner(
        uint256 propertyId
    ) external view returns (address) {
        require(properties[propertyId].exists, "Nekretnina ne postoji");

        return properties[propertyId].digitalOwner;
    }

    /**
     * @notice Provjerava je li nekretnina potvrđena.
     */
    function isPropertyVerified(
        uint256 propertyId
    ) external view returns (bool) {
        require(properties[propertyId].exists, "Nekretnina ne postoji");

        return
            properties[propertyId].verificationStatus ==
            VerificationStatus.Verified;
    }

    /**
     * @notice Dohvaća podatke registrirane nekretnine.
     *
     * @param propertyId Jedinstveni identifikator nekretnine.
     *
     * @return Podaci o nekretnini.
     */
    function getProperty(
        uint256 propertyId
    ) external view returns (Property memory) {
        require(properties[propertyId].exists, "Nekretnina ne postoji");

        return properties[propertyId];
    }

    /**
     * @notice Događaj koji se zapisuje nakon promjene digitalnog vlasnika.
     */
    event PropertyOwnershipTransferred(
        uint256 indexed propertyId,
        address indexed previousOwner,
        address indexed newOwner
    );
}
