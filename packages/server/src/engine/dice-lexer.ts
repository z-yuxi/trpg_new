export type TokenType =
  | 'NUMBER' | 'D' | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH'
  | 'LPAREN' | 'RPAREN' | 'KH' | 'KL' | 'R' | 'BANG' | 'EOF';

export interface Token {
  type: TokenType;
  value: string;
  position: number;
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const src = input.toLowerCase().trim();

  while (i < src.length) {
    const ch = src[i];

    // Skip whitespace
    if (/\s/.test(ch)) { i++; continue; }

    // Numbers
    if (/[0-9]/.test(ch)) {
      let num = '';
      const pos = i;
      while (i < src.length && /[0-9]/.test(src[i])) { num += src[i++]; }
      tokens.push({ type: 'NUMBER', value: num, position: pos });
      continue;
    }

    // 'd' keyword - check for 'kh', 'kl', 'r' BEFORE 'd'
    if (ch === 'k') {
      if (src[i + 1] === 'h') {
        tokens.push({ type: 'KH', value: 'kh', position: i });
        i += 2;
        continue;
      } else if (src[i + 1] === 'l') {
        tokens.push({ type: 'KL', value: 'kl', position: i });
        i += 2;
        continue;
      }
    }

    if (ch === 'r') {
      tokens.push({ type: 'R', value: 'r', position: i });
      i++;
      continue;
    }

    if (ch === 'd') {
      tokens.push({ type: 'D', value: 'd', position: i });
      i++;
      continue;
    }

    switch (ch) {
      case '+': tokens.push({ type: 'PLUS', value: '+', position: i++ }); break;
      case '-': tokens.push({ type: 'MINUS', value: '-', position: i++ }); break;
      case '*': tokens.push({ type: 'STAR', value: '*', position: i++ }); break;
      case '/': tokens.push({ type: 'SLASH', value: '/', position: i++ }); break;
      case '(': tokens.push({ type: 'LPAREN', value: '(', position: i++ }); break;
      case ')': tokens.push({ type: 'RPAREN', value: ')', position: i++ }); break;
      case '!': tokens.push({ type: 'BANG', value: '!', position: i++ }); break;
      default:
        throw new Error(`Unexpected character '${ch}' at position ${i}`);
    }
  }

  tokens.push({ type: 'EOF', value: '', position: i });
  return tokens;
}
