import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { DEFAULT_COMPANY_PROFILE } from '../lib/constants';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { CompanyProfile } from '../types';

export interface SaveCompanyInput {
  name: string;
  website: string;
  industry: string;
  services: string[];
  location: string;
  startDate: string;
  stage: string;
  goals: string[];
}

export interface UpdateCompanyMetricsInput {
  monthlyRevenue: number | null;
  activeProjectsCount: number | null;
  competitorsTrackedCount: number | null;
}

export async function getCompanyProfile(uid: string): Promise<CompanyProfile | null> {
  const path = `companies/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'companies', uid));
    if (!snap.exists()) return null;
    return snap.data() as CompanyProfile;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function createCompanyProfile(uid: string, input?: Partial<SaveCompanyInput>): Promise<void> {
  const path = `companies/${uid}`;
  const cleanServices = (input?.services ?? DEFAULT_COMPANY_PROFILE.services)
    .map((s) => s.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 30);

  const cleanGoals = (input?.goals ?? DEFAULT_COMPANY_PROFILE.goals)
    .map((g) => g.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 20);

  const payload = {
    ownerId: uid,
    name: (input?.name || DEFAULT_COMPANY_PROFILE.name).trim().slice(0, 160),
    website: (input?.website ?? DEFAULT_COMPANY_PROFILE.website).trim().slice(0, 300),
    industry: (input?.industry || DEFAULT_COMPANY_PROFILE.industry).trim().slice(0, 160),
    services: cleanServices,
    location: (input?.location ?? DEFAULT_COMPANY_PROFILE.location).trim().slice(0, 300),
    startDate: (input?.startDate ?? '').trim().slice(0, 40),
    stage: (input?.stage ?? '').trim().slice(0, 80),
    goals: cleanGoals,
    monthlyRevenue: null,
    activeProjectsCount: null,
    competitorsTrackedCount: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'companies', uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateCompanyProfile(uid: string, input: SaveCompanyInput): Promise<void> {
  const path = `companies/${uid}`;
  const cleanServices = input.services
    .map((s) => s.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 30);

  const cleanGoals = input.goals
    .map((g) => g.trim().slice(0, 160))
    .filter(Boolean)
    .slice(0, 20);

  try {
    await updateDoc(doc(db, 'companies', uid), {
      name: input.name.trim().slice(0, 160),
      website: input.website.trim().slice(0, 300),
      industry: input.industry.trim().slice(0, 160),
      services: cleanServices,
      location: input.location.trim().slice(0, 300),
      startDate: input.startDate.trim().slice(0, 40),
      stage: input.stage.trim().slice(0, 80),
      goals: cleanGoals,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateCompanyMetrics(uid: string, input: UpdateCompanyMetricsInput): Promise<void> {
  const path = `companies/${uid}`;
  try {
    await updateDoc(doc(db, 'companies', uid), {
      monthlyRevenue: input.monthlyRevenue ?? null,
      activeProjectsCount: input.activeProjectsCount ?? null,
      competitorsTrackedCount: input.competitorsTrackedCount ?? null,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}
