export enum Fields {
  ID = 'id',
  ContactType = 'contactType',
  Name = 'name',
  FirstName = 'firstName',
  MiddleName = 'middleName',
  LastName = 'lastName',
  MaidenName = 'maidenName',
  NamePrefix = 'namePrefix',
  NameSuffix = 'nameSuffix',
  Nickname = 'nickname',
  PhoneticFirstName = 'phoneticFirstName',
  PhoneticMiddleName = 'phoneticMiddleName',
  PhoneticLastName = 'phoneticLastName',
  Birthday = 'birthday',
  NonGregorianBirthday = 'nonGregorianBirthday',
  Emails = 'emails',
  PhoneNumbers = 'phoneNumbers',
  Addresses = 'addresses',
  SocialProfiles = 'socialProfiles',
  InstantMessageAddresses = 'instantMessageAddresses',
  UrlAddresses = 'urlAddresses',
  Company = 'company',
  JobTitle = 'jobTitle',
  Department = 'department',
  ImageAvailable = 'imageAvailable',
  Image = 'image',
  RawImage = 'rawImage',
  ExtraNames = 'extraNames',
  Note = 'note',
  Dates = 'dates',
  Relationships = 'relationships',
  IsFavorite = 'isFavorite',
}

export enum CalendarFormats {
  Gregorian = 'gregorian',
  Buddhist = 'buddhist',
  Chinese = 'chinese',
  Coptic = 'coptic',
  EthiopicAmeteMihret = 'ethiopicAmeteMihret',
  EthiopicAmeteAlem = 'ethiopicAmeteAlem',
  Hebrew = 'hebrew',
  ISO8601 = 'iso8601',
  Indian = 'indian',
  Islamic = 'islamic',
  IslamicCivil = 'islamicCivil',
  Japanese = 'japanese',
  Persian = 'persian',
  RepublicOfChina = 'republicOfChina',
  IslamicTabular = 'islamicTabular',
  IslamicUmmAlQura = 'islamicUmmAlQura',
}

export enum ContainerTypes {
  Local = 'local',
  Exchange = 'exchange',
  CardDAV = 'cardDAV',
  Unassigned = 'unassigned',
}

export enum SortTypes {
  UserDefault = 'userDefault',
  FirstName = 'firstName',
  LastName = 'lastName',
  None = 'none',
}

export enum ContactTypes {
  Person = 'person',
  Company = 'company',
}
