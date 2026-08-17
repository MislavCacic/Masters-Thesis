// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title PropertyRegistry
 * @notice Blockchain registar nekretnina, pripadajuće dokumentacije
 * i digitalnih vlasnika.
 *
 * Ovaj pametni ugovor predstavlja prototip i ne zamjenjuje
 * službeni upis vlasništva u zemljišne knjige Republike Hrvatske.
 */
contract PropertyRegistry is AccessControl {
    bytes32 public constant VERIFIER_ROLE = keccak256("VERIFIER_ROLE");
    bytes32 public constant TRANSFER_ROLE = keccak256("TRANSFER_ROLE");

    /**
     * @notice Broj obveznih vrsta dokumenata u prototipu.
     */
    uint8 public constant REQUIRED_DOCUMENT_COUNT = 3;

    /**
     * @notice Status provjere dokumenta ili ukupne dokumentacije nekretnine.
     */
    enum VerificationStatus {
        Pending,
        Verified,
        Rejected
    }

    /**
     * @notice Vrste dokumenata koje su obvezne prije prodaje nekretnine.
     *
     * Popis predstavlja prototip sustava.
     * Konačna interpretacija dokumentacije obrađuje se
     * u pravnom dijelu diplomskog rada.
     */
    enum DocumentType {
        LandRegistryExtract,
        CadastralDocument,
        OwnershipDocument
    }

    /**
     * @notice Dokument povezan s određenom nekretninom.
     *
     * Sadržaj dokumenta ne sprema se izravno na blockchain.
     *
     * documentHash predstavlja kriptografski hash sadržaja dokumenta
     * i koristi se za provjeru integriteta.
     *
     * documentURI predstavlja referencu na dokument pohranjen
     * izvan blockchaina, primjerice IPFS URI.
     */
    struct PropertyDocument {
        bytes32 documentHash;
        string documentURI;
        VerificationStatus verificationStatus;
        bool submitted;
    }

    /**
     * @notice Podaci o nekretnini spremljenoj u registru.
     */
    struct Property {
        uint256 id;
        string cadastralMunicipality;
        string parcelNumber;
        string propertyAddress;
        address digitalOwner;
        VerificationStatus verificationStatus;
        bool exists;
    }

    uint256 private nextPropertyId = 1;

    /**
     * @notice Registrirane nekretnine.
     */
    mapping(uint256 => Property) private properties;

    /**
     * @notice Dokumenti pojedine nekretnine prema vrsti dokumenta.
     */
    mapping(uint256 => mapping(DocumentType => PropertyDocument))
        private propertyDocuments;

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
     * @notice Događaj koji se zapisuje kada vlasnik preda dokument.
     */
    event PropertyDocumentSubmitted(
        uint256 indexed propertyId,
        DocumentType indexed documentType,
        bytes32 documentHash,
        string documentURI,
        address indexed submittedBy
    );

    /**
     * @notice Događaj koji se zapisuje kada verifikator potvrdi dokument.
     */
    event PropertyDocumentVerified(
        uint256 indexed propertyId,
        DocumentType indexed documentType,
        address indexed verifier
    );

    /**
     * @notice Događaj koji se zapisuje kada verifikator odbije dokument.
     */
    event PropertyDocumentRejected(
        uint256 indexed propertyId,
        DocumentType indexed documentType,
        address indexed verifier
    );

    /**
     * @notice Događaj koji se zapisuje kada cijela dokumentacija
     * nekretnine postane potvrđena.
     */
    event PropertyVerified(
        uint256 indexed propertyId,
        address indexed verifier
    );

    /**
     * @notice Događaj koji se zapisuje kada dokumentacija
     * nekretnine postane odbijena.
     */
    event PropertyRejected(
        uint256 indexed propertyId,
        address indexed verifier
    );

    /**
     * @notice Događaj promjene ukupnog statusa dokumentacije.
     */
    event PropertyVerificationStatusChanged(
        uint256 indexed propertyId,
        VerificationStatus previousStatus,
        VerificationStatus newStatus
    );

    /**
     * @notice Događaj koji se zapisuje nakon promjene digitalnog vlasnika.
     */
    event PropertyOwnershipTransferred(
        uint256 indexed propertyId,
        address indexed previousOwner,
        address indexed newOwner
    );

    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /**
     * @notice Registrira novu nekretninu u blockchain registru.
     *
     * Registracijom se još ne smatra da nekretnina ima
     * valjanu dokumentaciju. Dokumenti se dostavljaju zasebno.
     *
     * @param cadastralMunicipality Katastarska općina.
     * @param parcelNumber Broj katastarske čestice.
     * @param propertyAddress Adresa nekretnine.
     *
     * @return propertyId Jedinstveni identifikator nekretnine.
     */
    function registerProperty(
        string calldata cadastralMunicipality,
        string calldata parcelNumber,
        string calldata propertyAddress
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
     * @notice Predaje jedan od obveznih dokumenata nekretnine.
     *
     * Sadržaj dokumenta ne sprema se izravno na blockchain.
     *
     * Na blockchain se sprema:
     *  kriptografski hash dokumenta
     *  URI dokumenta pohranjenog izvan blockchaina
     *
     * Dokument može predati samo trenutni digitalni vlasnik.
     *
     * Odbijeni dokument moguće je ponovno predati.
     * Već potvrđeni dokument nije moguće mijenjati.
     *
     * @param propertyId ID nekretnine.
     * @param documentType Vrsta dokumenta.
     * @param documentHash Kriptografski hash dokumenta.
     * @param documentURI URI dokumenta pohranjenog izvan blockchaina.
     */
    function submitPropertyDocument(
        uint256 propertyId,
        DocumentType documentType,
        bytes32 documentHash,
        string calldata documentURI
    ) external {
        require(properties[propertyId].exists, "Nekretnina ne postoji");

        require(
            properties[propertyId].digitalOwner == msg.sender,
            "Samo vlasnik moze predati dokument"
        );

        require(documentHash != bytes32(0), "Hash dokumenta nije valjan");

        require(bytes(documentURI).length > 0, "URI dokumenta je obavezan");

        PropertyDocument storage document = propertyDocuments[propertyId][
            documentType
        ];

        require(
            document.verificationStatus != VerificationStatus.Verified,
            "Potvrdeni dokument nije moguce mijenjati"
        );

        document.documentHash = documentHash;
        document.documentURI = documentURI;
        document.verificationStatus = VerificationStatus.Pending;
        document.submitted = true;

        _refreshPropertyVerificationStatus(propertyId);

        emit PropertyDocumentSubmitted(
            propertyId,
            documentType,
            documentHash,
            documentURI,
            msg.sender
        );
    }

    /**
     * @notice Potvrđuje pojedinačni dokument nekretnine.
     *
     * Funkciju može pozvati samo korisnik s VERIFIER_ROLE ulogom.
     *
     * @param propertyId ID nekretnine.
     * @param documentType Vrsta dokumenta.
     */
    function verifyPropertyDocument(
        uint256 propertyId,
        DocumentType documentType
    ) external onlyRole(VERIFIER_ROLE) {
        require(properties[propertyId].exists, "Nekretnina ne postoji");

        PropertyDocument storage document = propertyDocuments[propertyId][
            documentType
        ];

        require(document.submitted, "Dokument nije predan");

        require(
            document.verificationStatus == VerificationStatus.Pending,
            "Dokument vise nije na cekanju"
        );

        document.verificationStatus = VerificationStatus.Verified;

        emit PropertyDocumentVerified(propertyId, documentType, msg.sender);

        VerificationStatus previousStatus = properties[propertyId]
            .verificationStatus;

        _refreshPropertyVerificationStatus(propertyId);

        if (
            previousStatus != VerificationStatus.Verified &&
            properties[propertyId].verificationStatus ==
            VerificationStatus.Verified
        ) {
            emit PropertyVerified(propertyId, msg.sender);
        }
    }

    /**
     * @notice Odbija pojedinačni dokument nekretnine.
     *
     * Funkciju može pozvati samo korisnik s VERIFIER_ROLE ulogom.
     *
     * @param propertyId ID nekretnine.
     * @param documentType Vrsta dokumenta.
     */
    function rejectPropertyDocument(
        uint256 propertyId,
        DocumentType documentType
    ) external onlyRole(VERIFIER_ROLE) {
        require(properties[propertyId].exists, "Nekretnina ne postoji");

        PropertyDocument storage document = propertyDocuments[propertyId][
            documentType
        ];

        require(document.submitted, "Dokument nije predan");

        require(
            document.verificationStatus == VerificationStatus.Pending,
            "Dokument vise nije na cekanju"
        );

        document.verificationStatus = VerificationStatus.Rejected;

        emit PropertyDocumentRejected(propertyId, documentType, msg.sender);

        VerificationStatus previousStatus = properties[propertyId]
            .verificationStatus;

        _refreshPropertyVerificationStatus(propertyId);

        if (
            previousStatus != VerificationStatus.Rejected &&
            properties[propertyId].verificationStatus ==
            VerificationStatus.Rejected
        ) {
            emit PropertyRejected(propertyId, msg.sender);
        }
    }

    /**
     * @notice Provjerava jesu li sva obvezna dokumenta predana.
     *
     * @param propertyId ID nekretnine.
     *
     * @return true ako su sva obvezna dokumenta predana.
     */
    function hasAllRequiredDocuments(
        uint256 propertyId
    ) public view returns (bool) {
        require(properties[propertyId].exists, "Nekretnina ne postoji");

        for (uint8 i = 0; i < REQUIRED_DOCUMENT_COUNT; i++) {
            DocumentType documentType = DocumentType(i);

            if (!propertyDocuments[propertyId][documentType].submitted) {
                return false;
            }
        }

        return true;
    }

    /**
     * @notice Provjerava jesu li sva obvezna dokumenta
     * predana i potvrđena.
     *
     * Ovo je ključna automatska provjera prije dopuštanja prodaje.
     *
     * @param propertyId ID nekretnine.
     *
     * @return true ako sva obvezna dokumentacija postoji
     * i svaki dokument ima status Verified.
     */
    function hasValidDocuments(uint256 propertyId) public view returns (bool) {
        require(properties[propertyId].exists, "Nekretnina ne postoji");

        for (uint8 i = 0; i < REQUIRED_DOCUMENT_COUNT; i++) {
            DocumentType documentType = DocumentType(i);

            PropertyDocument storage document = propertyDocuments[propertyId][
                documentType
            ];

            if (
                !document.submitted ||
                document.verificationStatus != VerificationStatus.Verified
            ) {
                return false;
            }
        }

        return true;
    }

    /**
     * @notice Vraća pojedinačni dokument nekretnine.
     *
     * Povratna vrijednost sadrži:
     * - hash dokumenta
     * - URI dokumenta
     * - status verifikacije
     * - informaciju je li dokument predan
     */
    function getPropertyDocument(
        uint256 propertyId,
        DocumentType documentType
    ) external view returns (PropertyDocument memory) {
        require(properties[propertyId].exists, "Nekretnina ne postoji");

        return propertyDocuments[propertyId][documentType];
    }

    /**
     * @notice Mijenja digitalnog vlasnika nekretnine.
     *
     * Prijenos je moguć samo ako su svi obvezni dokumenti
     * predani i potvrđeni.
     *
     * Funkciju može pozvati samo adresa s TRANSFER_ROLE ulogom.
     * U stvarnom toku prototipa tu ulogu ima RealEstateEscrow pametni ugovor.
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
            hasValidDocuments(propertyId),
            "Dokumentacija nekretnine nije valjana"
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
     * @notice Provjerava je li nekretnina spremna za prodaju
     * sa stajališta dokumentacije.
     */
    function isPropertyVerified(
        uint256 propertyId
    ) external view returns (bool) {
        return hasValidDocuments(propertyId);
    }

    /**
     * @notice Dohvaća podatke registrirane nekretnine.
     */
    function getProperty(
        uint256 propertyId
    ) external view returns (Property memory) {
        require(properties[propertyId].exists, "Nekretnina ne postoji");

        return properties[propertyId];
    }

    /**
     * @dev Automatski određuje ukupni status dokumentacije nekretnine.
     *
     * Pravila:
     *  ako je barem jedan predani dokument odbijen -> Rejected
     *  ako sva obvezna dokumenta postoje i potvrđena su -> Verified
     *  u svim ostalim slučajevima -> Pending
     */
    function _refreshPropertyVerificationStatus(uint256 propertyId) private {
        VerificationStatus previousStatus = properties[propertyId]
            .verificationStatus;

        bool allDocumentsVerified = true;
        bool hasRejectedDocument = false;

        for (uint8 i = 0; i < REQUIRED_DOCUMENT_COUNT; i++) {
            DocumentType documentType = DocumentType(i);

            PropertyDocument storage document = propertyDocuments[propertyId][
                documentType
            ];

            if (
                document.submitted &&
                document.verificationStatus == VerificationStatus.Rejected
            ) {
                hasRejectedDocument = true;
            }

            if (
                !document.submitted ||
                document.verificationStatus != VerificationStatus.Verified
            ) {
                allDocumentsVerified = false;
            }
        }

        VerificationStatus newStatus;

        if (hasRejectedDocument) {
            newStatus = VerificationStatus.Rejected;
        } else if (allDocumentsVerified) {
            newStatus = VerificationStatus.Verified;
        } else {
            newStatus = VerificationStatus.Pending;
        }

        properties[propertyId].verificationStatus = newStatus;

        if (previousStatus != newStatus) {
            emit PropertyVerificationStatusChanged(
                propertyId,
                previousStatus,
                newStatus
            );
        }
    }
}
