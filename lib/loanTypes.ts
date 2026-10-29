export type Addr = { no: string; moo: string; soi: string; road: string; subdistrict: string; district: string; province: string; postal: string };
export const emptyAddr: Addr = { no: '', moo: '', soi: '', road: '', subdistrict: '', district: '', province: '', postal: '' };

export type LoanProfile = {
  title: string; birthDate: string; nationality: string; idNumber: string;
  marital: '' | 'single' | 'married' | 'divorced'; registered: '' | 'yes'; children: string;
  phone: string; email: string; lineId: string;
  reg: Addr; curSame: boolean; cur: Addr; education: '' | '0' | '1' | '2' | '3';
  workPosition: string; workAddress: string; workPostal: string; workPhone: string; startDate: string;
  supName: string; supPhone: string;
  housing: '' | 'house' | 'twin' | 'town' | 'shop' | 'condo' | 'flat' | 'rent' | 'other';
  ownership: '' | 'own' | 'rent' | 'welfare' | 'with';
  spouseName: string; spouseWorkplace: string; spousePhone: string;
  yearsHere: string; salary: string;
  exp: { living: string; housing: string; car: string; home: string; other: string };
  contactName: string; contactRel: string; contactPhone: string; contactPlace: string;
  bankName: string; bankAccountName: string; bankAccountNo: string;
};

export const emptyProfile: LoanProfile = {
  title: 'นาย', birthDate: '', nationality: 'ไทย', idNumber: '', marital: '', registered: '', children: '',
  phone: '', email: '', lineId: '', reg: { ...emptyAddr }, curSame: true, cur: { ...emptyAddr }, education: '',
  workPosition: '', workAddress: '', workPostal: '', workPhone: '', startDate: '', supName: '', supPhone: '',
  housing: '', ownership: '', spouseName: '', spouseWorkplace: '', spousePhone: '', yearsHere: '', salary: '',
  exp: { living: '', housing: '', car: '', home: '', other: '' },
  contactName: '', contactRel: '', contactPhone: '', contactPlace: '',
  bankName: '', bankAccountName: '', bankAccountNo: '',
};
