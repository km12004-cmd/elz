export const PASSWORD_MIN_LENGTH = 8;

const LETTER_REGEX = /[A-Za-z\u0400-\u04FF]/;
const DIGIT_REGEX = /\d/;
const SPECIAL_REGEX = /[^A-Za-z0-9\u0400-\u04FF]/;

export function getPasswordRequirements(password = '') {
  return [
    {
      id: 'length',
      label: `At least ${PASSWORD_MIN_LENGTH} characters`,
      met: password.length >= PASSWORD_MIN_LENGTH,
    },
    {
      id: 'letter',
      label: 'At least one letter',
      met: LETTER_REGEX.test(password),
    },
    {
      id: 'digit',
      label: 'At least one digit',
      met: DIGIT_REGEX.test(password),
    },
    {
      id: 'special',
      label: 'At least one special character',
      met: SPECIAL_REGEX.test(password),
    },
  ];
}

export function getPasswordValidationMessage(password = '') {
  const requirements = getPasswordRequirements(password);
  const firstFailedRequirement = requirements.find((requirement) => !requirement.met);

  if (!firstFailedRequirement) return '';

  switch (firstFailedRequirement.id) {
    case 'length':
      return `Password must be at least ${PASSWORD_MIN_LENGTH} characters long.`;
    case 'letter':
      return 'Password must include at least one letter.';
    case 'digit':
      return 'Password must include at least one digit.';
    case 'special':
      return 'Password must include at least one special character.';
    default:
      return 'Password does not meet the minimum requirements.';
  }
}
