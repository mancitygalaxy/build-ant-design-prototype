import { Button, Card, Space, Tag, Typography } from 'antd'
import type { StarterCopy } from '../domain/prototype'

const { Paragraph, Text, Title } = Typography

interface PrototypePageProps {
  copy: StarterCopy
  count: number
  onIncrement: () => void
}

export function PrototypePage({ copy, count, onIncrement }: PrototypePageProps) {
  return (
    <main className="prototype-page" data-testid="prototype-ready">
      <Card className="prototype-card">
        <Space direction="vertical" size={20}>
          <Space size={8}>
            <Tag color="blue">React</Tag>
            <Tag color="geekblue">Ant Design</Tag>
            <Tag color="purple">单 HTML</Tag>
          </Space>
          <div>
            <Title level={1}>{copy.title}</Title>
            <Paragraph>{copy.description}</Paragraph>
          </div>
          <Space align="center" size={12}>
            <Button type="primary" data-testid="demo-increment" onClick={onIncrement}>
              增加
            </Button>
            <Text>
              当前计数：<strong data-testid="demo-count">{count}</strong>
            </Text>
          </Space>
        </Space>
      </Card>
    </main>
  )
}

