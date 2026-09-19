import React from 'react';

interface RawIsapiTabProps {
  rawMethod: 'GET' | 'PUT' | 'POST';
  setRawMethod: (m: 'GET' | 'PUT' | 'POST') => void;
  rawPath: string;
  setRawPath: (p: string) => void;
  rawBody: string;
  setRawBody: (b: string) => void;
  rawResult: string;
  rawLoading: boolean;
  onExecuteRaw: () => void;
}

export const RawIsapiTab: React.FC<RawIsapiTabProps> = ({
  rawMethod,
  setRawMethod,
  rawPath,
  setRawPath,
  rawBody,
  setRawBody,
  rawResult,
  rawLoading,
  onExecuteRaw,
}) => {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-white mb-1">Console</h3>
        <p className="text-xs text-slate-400">Execute custom ISAPI queries or inspect raw XML payloads for advanced camera parameters.</p>
      </div>

      <div className="flex gap-2">
        <select
          value={rawMethod}
          onChange={(e) => setRawMethod(e.target.value as 'GET' | 'PUT' | 'POST')}
          className="w-24 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-2 text-xs font-bold text-blue-400"
        >
          <option value="GET">GET</option>
          <option value="PUT">PUT</option>
          <option value="POST">POST</option>
        </select>

        <input
          type="text"
          value={rawPath}
          onChange={(e) => setRawPath(e.target.value)}
          placeholder="/ISAPI/System/deviceInfo"
          className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white font-mono"
        />

        <button
          type="button"
          onClick={onExecuteRaw}
          disabled={rawLoading}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors shrink-0 cursor-pointer"
        >
          {rawLoading ? 'Sending...' : 'Send Request'}
        </button>
      </div>

      {rawMethod !== 'GET' && (
        <div>
          <label className="block text-xs text-slate-400 mb-1">Request Body (XML / JSON)</label>
          <textarea
            rows={4}
            value={rawBody}
            onChange={(e) => setRawBody(e.target.value)}
            placeholder="<XMLPayload>...</XMLPayload>"
            className="w-full bg-slate-900 border border-slate-700 rounded-lg p-3 text-xs text-slate-200 font-mono"
          />
        </div>
      )}

      {rawResult && (
        <div>
          <label className="block text-xs text-slate-400 mb-1">Response</label>
          <pre className="p-3 bg-slate-900/90 border border-slate-800 rounded-lg text-xs font-mono text-emerald-400 overflow-x-auto max-h-64 whitespace-pre-wrap">
            {rawResult}
          </pre>
        </div>
      )}
    </div>
  );
};
