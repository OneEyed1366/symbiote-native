// What Google's code scanner adds to a result, Android only

type IAndroidBarcodeKind<TType extends string> = { type: TType };

export type IAndroidBarcode =
  | (IAndroidBarcodeKind<'contactInfo'> & {
      firstName?: string;
      middleName?: string;
      lastName?: string;
      title?: string;
      organization?: string;
      email?: string;
      phone?: string;
      url?: string;
      address?: string;
    })
  | (IAndroidBarcodeKind<'geoPoint'> & { lat: string; lng: string })
  | (IAndroidBarcodeKind<'sms'> & { phoneNumber?: string; message?: string })
  | (IAndroidBarcodeKind<'url'> & { url?: string })
  | (IAndroidBarcodeKind<'calendarEvent'> & {
      summary?: string;
      description?: string;
      location?: string;
      start?: string;
      end?: string;
    })
  | (IAndroidBarcodeKind<'driverLicense'> & {
      firstName?: string;
      middleName?: string;
      lastName?: string;
      licenseNumber?: string;
      expiryDate?: string;
      issueDate?: string;
      addressStreet?: string;
      addressCity?: string;
      addressState?: string;
    })
  | (IAndroidBarcodeKind<'email'> & {
      address?: string;
      subject?: string;
      body?: string;
    })
  | (IAndroidBarcodeKind<'phone'> & {
      number?: string;
      phoneNumberType?: string;
    })
  | (IAndroidBarcodeKind<'wifi'> & {
      ssid?: string;
      password?: string;
      encryptionType?: string;
    });
