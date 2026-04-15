import { tokenize, type Token, type TokenType } from './dice-lexer';

export interface DiceModifier {
  type: 'keep_highest' | 'keep_lowest' | 'reroll' | 'explode';
  value?: number;
}

export type DiceASTNode =
  | { type: 'number'; value: number }
  | { type: 'dice_roll'; count: number; sides: number; modifiers: DiceModifier[] }
  | { type: 'binary_op'; op: '+' | '-' | '*' | '/'; left: DiceASTNode; right: DiceASTNode }
  | { type: 'unary_minus'; operand: DiceASTNode }
  | { type: 'group'; expression: DiceASTNode };

class Parser {
  private tokens: Token[];
  private pos = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private consume(type?: TokenType): Token {
    const tok = this.tokens[this.pos];
    if (type && tok.type !== type) {
      throw new Error(`Expected ${type} but got ${tok.type} at position ${tok.position}`);
    }
    this.pos++;
    return tok;
  }

  private match(...types: TokenType[]): boolean {
    return types.includes(this.peek().type);
  }

  // expression = additive
  parseExpression(): DiceASTNode {
    return this.parseAdditive();
  }

  // additive = multiplicative (('+' | '-') multiplicative)*
  private parseAdditive(): DiceASTNode {
    let left = this.parseMultiplicative();
    while (this.match('PLUS', 'MINUS')) {
      const op = this.consume().value as '+' | '-';
      const right = this.parseMultiplicative();
      left = { type: 'binary_op', op, left, right };
    }
    return left;
  }

  // multiplicative = unary (('*' | '/') unary)*
  private parseMultiplicative(): DiceASTNode {
    let left = this.parseUnary();
    while (this.match('STAR', 'SLASH')) {
      const op = this.consume().value as '*' | '/';
      const right = this.parseUnary();
      left = { type: 'binary_op', op, left, right };
    }
    return left;
  }

  // unary = '-' unary | primary
  private parseUnary(): DiceASTNode {
    if (this.match('MINUS')) {
      this.consume();
      const operand = this.parseUnary();
      return { type: 'unary_minus', operand };
    }
    return this.parsePrimary();
  }

  // primary = '(' expression ')' | NUMBER ('d' NUMBER modifiers)?
  private parsePrimary(): DiceASTNode {
    if (this.match('LPAREN')) {
      this.consume('LPAREN');
      const expr = this.parseExpression();
      this.consume('RPAREN');
      return { type: 'group', expression: expr };
    }

    const numTok = this.consume('NUMBER');
    const count = parseInt(numTok.value, 10);

    // dice roll: NdS[modifiers]
    if (this.match('D')) {
      this.consume('D');
      const sidesTok = this.consume('NUMBER');
      const sides = parseInt(sidesTok.value, 10);
      const modifiers: DiceModifier[] = [];

      // Parse modifiers: kh, kl, r, !
      while (this.match('KH', 'KL', 'R', 'BANG')) {
        const modType = this.peek().type;
        this.consume();
        if (modType === 'KH') {
          const valTok = this.consume('NUMBER');
          modifiers.push({ type: 'keep_highest', value: parseInt(valTok.value, 10) });
        } else if (modType === 'KL') {
          const valTok = this.consume('NUMBER');
          modifiers.push({ type: 'keep_lowest', value: parseInt(valTok.value, 10) });
        } else if (modType === 'R') {
          const valTok = this.consume('NUMBER');
          modifiers.push({ type: 'reroll', value: parseInt(valTok.value, 10) });
        } else if (modType === 'BANG') {
          modifiers.push({ type: 'explode' });
        }
      }

      return { type: 'dice_roll', count, sides, modifiers };
    }

    return { type: 'number', value: count };
  }
}

export function parse(tokens: Token[]): DiceASTNode {
  const parser = new Parser(tokens);
  const ast = parser.parseExpression();
  return ast;
}

export function parseExpression(input: string): DiceASTNode {
  const tokens = tokenize(input);
  return parse(tokens);
}
