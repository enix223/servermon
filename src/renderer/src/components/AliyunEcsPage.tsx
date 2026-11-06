import { CloudIcon, CubeIcon } from './Icons'

interface AliyunEcsPageProps {
  onBack: () => void
}

/**
 * Layout placeholder for the planned Alibaba Cloud ECS module. No Alibaba Cloud
 * API or credentials are used yet — this page exists so module navigation and
 * page structure are already in place.
 */
export function AliyunEcsPage({ onBack }: AliyunEcsPageProps) {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-6 pt-[26px] pb-10">
      <div className="mb-5 flex items-start justify-between gap-6">
        <div>
          <h1 className="m-0 text-2xl font-semibold tracking-[-0.02em]">ECS servers</h1>
          <p className="mt-[7px] max-w-[640px] text-[12.5px] leading-[1.5] text-muted">
            Monitor Alibaba Cloud Elastic Compute Service instances through the Alibaba Cloud
            API.
          </p>
        </div>
        <span className="planned-badge">Planned</span>
      </div>

      <div className="mt-[22px] grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(260px,1fr)]">
        <section className="flex flex-col items-start rounded-panel border border-line bg-linear-to-b from-[#141c27]/85 to-[#0d1219]/85 p-7">
          <div className="empty-icon mx-0">
            <CloudIcon size={30} />
          </div>
          <h2 className="m-0 text-[18px] font-semibold tracking-[-0.01em]">
            Alibaba Cloud monitoring is not wired up yet
          </h2>
          <p className="mt-2 mb-5 max-w-[540px] text-[12.5px] leading-[1.6] text-muted">
            This page is a layout placeholder. The sidebar, module routing, and data API contract
            are ready for an Aliyun adapter; no Alibaba Cloud credentials or requests are used
            yet.
          </p>
          <button type="button" className="btn" onClick={onBack}>
            <CubeIcon size={15} />
            Back to Kubernetes pods
          </button>
        </section>

        <section className="rounded-panel border border-line bg-linear-to-b from-[#141c27]/85 to-[#0d1219]/85 p-7">
          <h3 className="mb-4 text-[10.5px] font-semibold tracking-[0.09em] text-muted uppercase">
            Planned capabilities
          </h3>
          <ul className="planned-list">
            <li>
              <strong>Instance inventory</strong>
              <span>Status, region, instance type, and public/private IPs.</span>
            </li>
            <li>
              <strong>Resource metrics</strong>
              <span>CPU, memory, disk, and network from CloudMonitor.</span>
            </li>
            <li>
              <strong>Account connections</strong>
              <span>AccessKey or RAM role settings, stored locally.</span>
            </li>
          </ul>
        </section>
      </div>
    </div>
  )
}
