export type DriverAuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
};

export type DriverRootStackParamList = DriverAuthStackParamList & {
  Pending: undefined;
  Home: undefined;
};

export type DriverVerificationStatus = 'pending' | 'approved' | 'rejected';

export type DriverState = {
  profile_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  verification_status: DriverVerificationStatus;
  verified_badge: boolean;
  is_online: boolean;
  is_available: boolean;
};
