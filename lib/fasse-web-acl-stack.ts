import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { EnvironmentConfig } from './config';

export interface FasseWebAclStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

// CloudFront用のWAFv2 WebACL(scope: CLOUDFRONT)はus-east-1でのみ作成可能というAWS側の制約があるため、
// 主リージョン(ap-northeast-1)のFasseInfraStackとは別スタックに分離する
// (docs/spec/web-hosting/design.md 3.4節、REQ-301/REQ-302)。
export class FasseWebAclStack extends cdk.Stack {
  public readonly webAclArn: string;

  constructor(scope: Construct, id: string, props: FasseWebAclStackProps) {
    super(scope, id, props);

    const { resourcePrefix } = props.config;

    // 既存のAPI Gateway用WAF(lib/fasse_infra-stack.ts の ApiWebAcl, scope: REGIONAL)と同様、
    // 当面はAWSマネージドルールのみを適用する。IP制限/Basic認証等の追加方式は未決定のため導入しない
    // (docs/spec/authentication/design.md「7. 未決定事項」と同一の未決定事項。REQ-303)。
    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      scope: 'CLOUDFRONT',
      defaultAction: { allow: {} },
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${resourcePrefix}-web-waf`,
        sampledRequestsEnabled: true,
      },
      rules: [
        {
          name: 'AWS-AWSManagedRulesCommonRuleSet',
          priority: 0,
          overrideAction: { none: {} },
          statement: {
            managedRuleGroupStatement: {
              vendorName: 'AWS',
              name: 'AWSManagedRulesCommonRuleSet',
            },
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            metricName: `${resourcePrefix}-web-waf-common`,
            sampledRequestsEnabled: true,
          },
        },
      ],
    });

    this.webAclArn = webAcl.attrArn;
  }
}
