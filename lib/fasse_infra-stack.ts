import * as path from 'path';
import * as cdk from 'aws-cdk-lib/core';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { EnvironmentConfig } from './config';

export interface FasseInfraStackProps extends cdk.StackProps {
  config: EnvironmentConfig;
}

export class FasseInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FasseInfraStackProps) {
    super(scope, id, props);

    const { resourcePrefix, envName } = props.config;
    const removalPolicy =
      envName === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY;

    // 採番用カウンタテーブル（マスタのid、purchase_no/sales_noの連番管理）
    const countersTable = new dynamodb.Table(this, 'CountersTable', {
      tableName: `${resourcePrefix}-counters`,
      partitionKey: { name: 'counter_name', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    // マスタ（IDはcountersテーブルで採番する連番）
    const itemTable = new dynamodb.Table(this, 'ItemTable', {
      tableName: `${resourcePrefix}-m-item`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    const supplierTable = new dynamodb.Table(this, 'SupplierTable', {
      tableName: `${resourcePrefix}-m-supplier`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    const menuTable = new dynamodb.Table(this, 'MenuTable', {
      tableName: `${resourcePrefix}-m-menu`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.NUMBER },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    // 消費税率マスタ（tax_category + valid_fromの複合キーで期間管理する。連番採番は行わない）
    const taxRateTable = new dynamodb.Table(this, 'TaxRateTable', {
      tableName: `${resourcePrefix}-m-tax-rate`,
      partitionKey: { name: 'tax_category', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'valid_from', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    // 仕入（IDはUUID。detailはヘッダのidをPKに持つ）
    const purchaseHeaderTable = new dynamodb.Table(this, 'PurchaseHeaderTable', {
      tableName: `${resourcePrefix}-t-purchase-header`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });
    purchaseHeaderTable.addGlobalSecondaryIndex({
      indexName: 'gsi_purchase_date',
      partitionKey: { name: 'gsi_pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'purchase_date', type: dynamodb.AttributeType.STRING },
    });

    const purchaseDetailTable = new dynamodb.Table(this, 'PurchaseDetailTable', {
      tableName: `${resourcePrefix}-t-purchase-detail`,
      partitionKey: { name: 'purchase_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    // 売上（IDはUUID。detailはヘッダのidをPKに持つ）
    const salesHeaderTable = new dynamodb.Table(this, 'SalesHeaderTable', {
      tableName: `${resourcePrefix}-t-sales-header`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });
    salesHeaderTable.addGlobalSecondaryIndex({
      indexName: 'gsi_business_date',
      partitionKey: { name: 'gsi_pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'business_date', type: dynamodb.AttributeType.STRING },
    });

    const salesDetailTable = new dynamodb.Table(this, 'SalesDetailTable', {
      tableName: `${resourcePrefix}-t-sales-detail`,
      partitionKey: { name: 'sales_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
    });

    // --- Lambda + API Gateway ---
    // 認証なし（第一弾は疎通確認優先）
    const api = new apigateway.RestApi(this, 'Api', {
      restApiName: `${resourcePrefix}-api`,
      deployOptions: { stageName: envName },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
      },
    });

    const commonFunctionProps: Partial<lambdaNodejs.NodejsFunctionProps> = {
      runtime: lambda.Runtime.NODEJS_20_X,
      bundling: { minify: true },
    };

    function addCrudResource(
      resourceName: string,
      fn: lambdaNodejs.NodejsFunction,
    ): void {
      const integration = new apigateway.LambdaIntegration(fn);
      const collection = api.root.addResource(resourceName);
      collection.addMethod('GET', integration);
      collection.addMethod('POST', integration);
      const single = collection.addResource('{id}');
      single.addMethod('GET', integration);
      single.addMethod('PUT', integration);
      single.addMethod('DELETE', integration);
    }

    // マスタ: items / suppliers / menus
    const itemsFunction = new lambdaNodejs.NodejsFunction(this, 'ItemsFunction', {
      ...commonFunctionProps,
      entry: path.join(__dirname, 'lambda', 'items.ts'),
      environment: {
        ITEM_TABLE: itemTable.tableName,
        COUNTERS_TABLE: countersTable.tableName,
      },
    });
    itemTable.grantReadWriteData(itemsFunction);
    countersTable.grantReadWriteData(itemsFunction);
    addCrudResource('items', itemsFunction);

    const suppliersFunction = new lambdaNodejs.NodejsFunction(this, 'SuppliersFunction', {
      ...commonFunctionProps,
      entry: path.join(__dirname, 'lambda', 'suppliers.ts'),
      environment: {
        SUPPLIER_TABLE: supplierTable.tableName,
        COUNTERS_TABLE: countersTable.tableName,
      },
    });
    supplierTable.grantReadWriteData(suppliersFunction);
    countersTable.grantReadWriteData(suppliersFunction);
    addCrudResource('suppliers', suppliersFunction);

    const menusFunction = new lambdaNodejs.NodejsFunction(this, 'MenusFunction', {
      ...commonFunctionProps,
      entry: path.join(__dirname, 'lambda', 'menus.ts'),
      environment: {
        MENU_TABLE: menuTable.tableName,
        COUNTERS_TABLE: countersTable.tableName,
      },
    });
    menuTable.grantReadWriteData(menusFunction);
    countersTable.grantReadWriteData(menusFunction);
    addCrudResource('menus', menusFunction);

    // 消費税率マスタ: tax-rates（tax_category + valid_fromの複合キーのため{id}方式ではなく専用ルーティングを行う。
    // t_purchase_detail/t_sales_detailからFK参照されず物理削除が可能なため、他マスタのcountersテーブルは使わない）
    const taxRatesFunction = new lambdaNodejs.NodejsFunction(this, 'TaxRatesFunction', {
      ...commonFunctionProps,
      entry: path.join(__dirname, 'lambda', 'taxRates.ts'),
      environment: {
        TAX_RATE_TABLE: taxRateTable.tableName,
      },
    });
    taxRateTable.grantReadWriteData(taxRatesFunction);

    const taxRatesIntegration = new apigateway.LambdaIntegration(taxRatesFunction);
    const taxRatesCollection = api.root.addResource('tax-rates');
    taxRatesCollection.addMethod('GET', taxRatesIntegration);
    taxRatesCollection.addMethod('POST', taxRatesIntegration);
    const taxRateSingle = taxRatesCollection.addResource('{taxCategory}').addResource('{validFrom}');
    taxRateSingle.addMethod('GET', taxRatesIntegration);
    taxRateSingle.addMethod('PUT', taxRatesIntegration);
    taxRateSingle.addMethod('DELETE', taxRatesIntegration);

    // 仕入伝票: purchases（ヘッダ+明細）
    const purchasesFunction = new lambdaNodejs.NodejsFunction(this, 'PurchasesFunction', {
      ...commonFunctionProps,
      entry: path.join(__dirname, 'lambda', 'purchases.ts'),
      environment: {
        PURCHASE_HEADER_TABLE: purchaseHeaderTable.tableName,
        PURCHASE_DETAIL_TABLE: purchaseDetailTable.tableName,
        COUNTERS_TABLE: countersTable.tableName,
      },
    });
    purchaseHeaderTable.grantReadWriteData(purchasesFunction);
    purchaseDetailTable.grantReadWriteData(purchasesFunction);
    countersTable.grantReadWriteData(purchasesFunction);
    addCrudResource('purchases', purchasesFunction);

    // 売上伝票: sales（ヘッダ+明細）
    const salesFunction = new lambdaNodejs.NodejsFunction(this, 'SalesFunction', {
      ...commonFunctionProps,
      entry: path.join(__dirname, 'lambda', 'sales.ts'),
      environment: {
        SALES_HEADER_TABLE: salesHeaderTable.tableName,
        SALES_DETAIL_TABLE: salesDetailTable.tableName,
        COUNTERS_TABLE: countersTable.tableName,
      },
    });
    salesHeaderTable.grantReadWriteData(salesFunction);
    salesDetailTable.grantReadWriteData(salesFunction);
    countersTable.grantReadWriteData(salesFunction);
    addCrudResource('sales', salesFunction);
  }
}
