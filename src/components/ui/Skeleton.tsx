import React from 'react';

export const SkeletonBlock: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`} />
);

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6">
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div className="space-y-2">
        <SkeletonBlock className="h-8 w-64" />
        <SkeletonBlock className="h-4 w-48" />
      </div>
      <SkeletonBlock className="h-11 w-36" />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((idx) => (
        <div key={idx} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <SkeletonBlock className="h-4 w-24" />
            <SkeletonBlock className="h-9 w-9 rounded-xl" />
          </div>
          <SkeletonBlock className="h-8 w-32" />
          <SkeletonBlock className="h-4 w-full" />
        </div>
      ))}
    </div>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
        <SkeletonBlock className="h-6 w-44" />
        <SkeletonBlock className="h-56 w-full" />
      </div>
      <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-4">
        <SkeletonBlock className="h-6 w-40" />
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-16 w-full" />
        <SkeletonBlock className="h-16 w-full" />
      </div>
    </div>
  </div>
);

export const FormPageSkeleton: React.FC = () => (
  <div className="max-w-3xl space-y-6">
    <div className="space-y-2">
      <SkeletonBlock className="h-8 w-52" />
      <SkeletonBlock className="h-4 w-72" />
    </div>
    <div className="bg-white border border-[#E2E8F0] rounded-2xl p-6 space-y-5">
      <SkeletonBlock className="h-11 w-full" />
      <SkeletonBlock className="h-11 w-full" />
      <SkeletonBlock className="h-11 w-2/3" />
      <SkeletonBlock className="h-11 w-40" />
    </div>
  </div>
);
