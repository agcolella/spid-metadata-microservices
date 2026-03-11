export const ALLOWED_XMLDSIG_ALGS = [
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256',
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha384',
  'http://www.w3.org/2001/04/xmldsig-more#rsa-sha512',
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha256',
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha384',
  'http://www.w3.org/2001/04/xmldsig-more#ecdsa-sha512'
];

export const ALLOWED_DGST_ALGS = [
  'http://www.w3.org/2001/04/xmlenc#sha256',
  'http://www.w3.org/2001/04/xmlenc#sha384',
  'http://www.w3.org/2001/04/xmlenc#sha512'
];

export const ALLOWED_BINDINGS = [
  'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
  'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect'
];

export const ALLOWED_SINGLELOGOUT_BINDINGS = [
  'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
  'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect',
  'urn:oasis:names:tc:SAML:2.0:bindings:SOAP'
];

export const NAMEID_FORMAT_TRANSIENT =
  'urn:oasis:names:tc:SAML:2.0:nameid-format:transient';

export const SPID_ATTRIBUTES = [
  'spidCode', 'name', 'familyName', 'placeOfBirth', 'countyOfBirth',
  'dateOfBirth', 'gender', 'companyName', 'registeredOffice', 'fiscalNumber',
  'ivaCode', 'idCard', 'mobilePhone', 'email', 'address', 'expirationDate',
  'digitalAddress'
];

export const CIE_ATTRIBUTES = [
  'name', 'familyName', 'placeOfBirth', 'countyOfBirth', 'dateOfBirth',
  'gender', 'companyName', 'registeredOffice', 'fiscalNumber', 'ivaCode',
  'idCard', 'mobilePhone', 'email', 'address', 'expirationDate',
  'digitalAddress'
];

export const FICEP_MIN_ATTRIBUTES  = ['currentFamilyName', 'currentGivenName', 'dateOfBirth', 'personIdentifier'];
export const FICEP_FULL_ATTRIBUTES = [...FICEP_MIN_ATTRIBUTES, 'birthName', 'placeOfBirth', 'currentAddress', 'gender'];
