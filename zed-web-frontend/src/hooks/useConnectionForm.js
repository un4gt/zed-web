import { useCallback, useState } from 'react';
import { DEFAULT_SSH_HOST } from '../lib/config';

const DEFAULT_CONNECTION_FORM = {
  host: DEFAULT_SSH_HOST,
  user: '',
  port: '22',
  projectPath: '/tmp',
  remoteServerMode: 'latest',
  remoteServerVersion: 'v0.232.3',
};

function useConnectionForm() {
  const [form, setForm] = useState(() => DEFAULT_CONNECTION_FORM);

  const updateFormField = useCallback((field, value) => {
    setForm((state) => ({ ...state, [field]: value }));
  }, []);

  return {
    form,
    updateFormField,
  };
}

export default useConnectionForm;
